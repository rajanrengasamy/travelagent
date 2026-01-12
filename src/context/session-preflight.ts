/**
 * Session Preflight - Unified Context Retrieval for Commands & Skills
 *
 * Provides a single entry point for context retrieval that:
 * 1. Checks session cache first (populated by /startagain)
 * 2. Falls back to VectorDB retrieval
 * 3. Falls back to file-based reading if VectorDB unavailable
 *
 * This consolidates the Phase 0 context retrieval logic shared by
 * /develop, /qa, and their associated skills.
 *
 * @module context/session-preflight
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { ContextBundle, TodoSnapshot } from './types.js';
import {
  loadSessionCache,
  saveSessionCache,
  getSessionCacheInfo,
} from './session-cache.js';
import { getRelevantContext, getCurrentTodoState, queryPrdSections } from './retrieval.js';

/**
 * Cache TTL in minutes (configurable via env var)
 */
const CACHE_TTL_MINUTES = parseInt(process.env.TRAVELAGENT_CACHE_TTL ?? '60', 10);

/**
 * LanceDB database path
 */
const LANCEDB_PATH = path.join(os.homedir(), '.travelagent', 'context', 'lancedb');

/**
 * Context source used for retrieval
 */
export type ContextSource = 'cache' | 'vectordb' | 'files' | 'none';

/**
 * Result of preflight context check
 */
export interface PreflightResult {
  /** The context bundle (may be partial if source is 'files') */
  context: ContextBundle | null;
  /** Where the context came from */
  source: ContextSource;
  /** Warning message if any */
  warning?: string;
  /** Whether VectorDB is available */
  vectorDbAvailable: boolean;
  /** Whether session cache is fresh */
  cacheAvailable: boolean;
  /** Cache age in minutes (if available) */
  cacheAgeMinutes?: number;
}

/**
 * Check if VectorDB is available
 */
export async function isVectorDbAvailable(): Promise<boolean> {
  try {
    await fs.access(LANCEDB_PATH);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if source files are newer than VectorDB (staleness check)
 *
 * @param todoPath - Path to TODO file
 * @param prdPath - Path to PRD file
 * @returns Warning message if VectorDB may be stale, undefined otherwise
 */
export async function checkVectorDbStaleness(
  todoPath: string = 'todo/tasks-phase0-travel-discovery.md',
  prdPath: string = 'docs/phase_0_prd_unified.md'
): Promise<string | undefined> {
  try {
    // Get file modification times
    const [todoStat, prdStat] = await Promise.all([
      fs.stat(todoPath).catch(() => null),
      fs.stat(prdPath).catch(() => null),
    ]);

    // Get VectorDB modification time (check any .lance file)
    const lanceFiles = await fs.readdir(LANCEDB_PATH).catch(() => []);
    if (lanceFiles.length === 0) return undefined;

    const firstLanceDir = path.join(LANCEDB_PATH, lanceFiles[0]);
    const lanceContents = await fs.readdir(firstLanceDir).catch(() => []);
    const lanceFile = lanceContents.find((f) => f.endsWith('.lance'));
    if (!lanceFile) return undefined;

    const lanceStat = await fs.stat(path.join(firstLanceDir, lanceFile)).catch(() => null);
    if (!lanceStat) return undefined;

    const lanceTime = lanceStat.mtime.getTime();
    const todoTime = todoStat?.mtime.getTime() ?? 0;
    const prdTime = prdStat?.mtime.getTime() ?? 0;

    if (todoTime > lanceTime || prdTime > lanceTime) {
      return 'VectorDB may be STALE - source files modified after last index. Run `npm run seed-context` to re-index.';
    }

    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Get session context with automatic fallback
 *
 * This is the main entry point for commands and skills to get context.
 * It automatically handles:
 * - Session cache (fastest)
 * - VectorDB retrieval (semantic search)
 * - File-based fallback (last resort)
 *
 * @param query - Focus query for relevant context (e.g., "Section 10 implementation")
 * @param maxCacheAge - Maximum cache age in minutes (default: from env or 60)
 * @returns Preflight result with context and metadata
 */
export async function getSessionContext(
  query: string,
  maxCacheAge: number = CACHE_TTL_MINUTES
): Promise<PreflightResult> {
  const vectorDbAvailable = await isVectorDbAvailable();
  const cacheInfo = await getSessionCacheInfo();
  const cacheAvailable = cacheInfo !== null && cacheInfo.ageMinutes <= maxCacheAge;

  // 1. Try session cache first (fastest)
  if (cacheAvailable) {
    const cached = await loadSessionCache(maxCacheAge);
    if (cached) {
      return {
        context: cached,
        source: 'cache',
        vectorDbAvailable,
        cacheAvailable: true,
        cacheAgeMinutes: cacheInfo?.ageMinutes,
      };
    }
  }

  // 2. Try VectorDB retrieval
  if (vectorDbAvailable) {
    try {
      const stalenessWarning = await checkVectorDbStaleness();
      const context = await getRelevantContext(query);

      // Save to cache for subsequent calls
      await saveSessionCache(context, query);

      return {
        context,
        source: 'vectordb',
        warning: stalenessWarning,
        vectorDbAvailable: true,
        cacheAvailable: false,
      };
    } catch (error) {
      console.error('VectorDB retrieval failed:', error);
      // Fall through to file-based
    }
  }

  // 3. Fallback: VectorDB not available or failed
  return {
    context: null,
    source: 'none',
    warning: 'VectorDB not available - context retrieval unavailable. Run `npm run seed-context` to initialize.',
    vectorDbAvailable: false,
    cacheAvailable: false,
  };
}

/**
 * Ensure context is available, throwing if not
 *
 * Use this when context is required and you want to fail fast.
 *
 * @param query - Focus query for relevant context
 * @returns Context bundle (guaranteed non-null)
 * @throws Error if context is unavailable
 */
export async function ensureContext(query: string): Promise<ContextBundle> {
  const result = await getSessionContext(query);

  if (!result.context) {
    throw new Error(result.warning ?? 'Context unavailable');
  }

  return result.context;
}

/**
 * Quick check if any context source is available
 *
 * Use this for fast preflight checks before spawning agents.
 *
 * @returns Object with availability flags
 */
export async function checkContextAvailability(): Promise<{
  cacheAvailable: boolean;
  vectorDbAvailable: boolean;
  cacheAgeMinutes: number | null;
}> {
  const [vectorDbAvailable, cacheInfo] = await Promise.all([
    isVectorDbAvailable(),
    getSessionCacheInfo(),
  ]);

  return {
    cacheAvailable: cacheInfo !== null && cacheInfo.ageMinutes <= CACHE_TTL_MINUTES,
    vectorDbAvailable,
    cacheAgeMinutes: cacheInfo?.ageMinutes ?? null,
  };
}

/**
 * Get just the TODO state (useful for dependency checks)
 *
 * @returns Current TODO snapshot or null
 */
export async function getTodoState(): Promise<TodoSnapshot | null> {
  // Try cache first
  const cached = await loadSessionCache(CACHE_TTL_MINUTES);
  if (cached?.todoState) {
    return cached.todoState;
  }

  // Fall back to direct retrieval
  if (await isVectorDbAvailable()) {
    return getCurrentTodoState();
  }

  return null;
}

/**
 * Get PRD sections relevant to a query (useful for understanding requirements)
 *
 * @param query - Search query
 * @param limit - Maximum sections to return
 * @returns Array of relevant PRD sections
 */
export async function getRelevantPrdSections(
  query: string,
  limit: number = 5
): Promise<ContextBundle['relevantPrdSections']> {
  // Try cache first
  const cached = await loadSessionCache(CACHE_TTL_MINUTES);
  if (cached?.relevantPrdSections && cached.relevantPrdSections.length > 0) {
    return cached.relevantPrdSections.slice(0, limit);
  }

  // Fall back to direct retrieval
  if (await isVectorDbAvailable()) {
    return queryPrdSections(query, limit);
  }

  return [];
}

/**
 * Format context status for display in commands
 *
 * @param result - Preflight result
 * @returns Formatted status string
 */
export function formatContextStatus(result: PreflightResult): string {
  const lines: string[] = [];

  if (result.source === 'cache') {
    lines.push(`Using cached context from ${result.cacheAgeMinutes} minutes ago`);
  } else if (result.source === 'vectordb') {
    lines.push('Retrieved context from VectorDB');
  } else {
    lines.push('Context unavailable');
  }

  if (result.warning) {
    lines.push(`Warning: ${result.warning}`);
  }

  return lines.join('\n');
}

/**
 * Error thrown when VectorDB is required but not available
 */
export class VectorDbRequiredError extends Error {
  constructor(message: string = 'VectorDB is required but not available') {
    super(message);
    this.name = 'VectorDbRequiredError';
  }
}

/**
 * Require VectorDB to be available, throwing if not
 *
 * Use this as a preflight check before development/QA operations.
 *
 * @throws VectorDbRequiredError if VectorDB is not available
 */
export async function requireVectorDb(): Promise<void> {
  const available = await isVectorDbAvailable();
  if (!available) {
    throw new VectorDbRequiredError(
      'VectorDB is required for /develop and /qa commands.\n' +
        'Run `npm run seed-context` to initialize the VectorDB with PRD, TODO, and journal data.'
    );
  }

  // Also check for staleness
  const stalenessWarning = await checkVectorDbStaleness();
  if (stalenessWarning) {
    console.warn(`⚠️  ${stalenessWarning}`);
  }
}

/**
 * Get session context with VectorDB REQUIRED
 *
 * This is the enforced version for /develop and /qa commands.
 * It will throw if VectorDB is not available instead of falling back.
 *
 * @param query - Focus query for relevant context
 * @param maxCacheAge - Maximum cache age in minutes
 * @returns Preflight result with context guaranteed from VectorDB or cache
 * @throws VectorDbRequiredError if VectorDB is not available
 */
export async function getSessionContextStrict(
  query: string,
  maxCacheAge: number = CACHE_TTL_MINUTES
): Promise<PreflightResult> {
  // First, enforce VectorDB availability
  await requireVectorDb();

  // Now get context (will use cache or VectorDB, never files)
  const result = await getSessionContext(query, maxCacheAge);

  // Double-check we got valid context
  if (!result.context) {
    throw new VectorDbRequiredError(
      'Failed to retrieve context from VectorDB.\n' +
        'Ensure VectorDB is properly seeded with `npm run seed-context`.'
    );
  }

  return result;
}

/**
 * Ensure context is available from VectorDB, throwing if not
 *
 * Strict version of ensureContext that requires VectorDB.
 *
 * @param query - Focus query for relevant context
 * @returns Context bundle (guaranteed from VectorDB or cache)
 * @throws VectorDbRequiredError if VectorDB is not available
 */
export async function ensureContextStrict(query: string): Promise<ContextBundle> {
  const result = await getSessionContextStrict(query);
  return result.context!;
}

/**
 * Get TODO state with VectorDB required
 *
 * @returns Current TODO snapshot
 * @throws VectorDbRequiredError if VectorDB is not available
 */
export async function getTodoStateStrict(): Promise<TodoSnapshot> {
  await requireVectorDb();

  const todoState = await getTodoState();
  if (!todoState) {
    throw new VectorDbRequiredError(
      'No TODO state found in VectorDB.\n' +
        'Run `npm run seed-context` to index the TODO file.'
    );
  }

  return todoState;
}

/**
 * Check VectorDB readiness and return diagnostic info
 *
 * Use this for detailed status reporting in commands.
 *
 * @returns Diagnostic info about VectorDB state
 */
export async function getVectorDbDiagnostics(): Promise<{
  available: boolean;
  path: string;
  stale: boolean;
  stalenessMessage?: string;
  collections: string[];
}> {
  const available = await isVectorDbAvailable();
  const stalenessMessage = available ? await checkVectorDbStaleness() : undefined;

  let collections: string[] = [];
  if (available) {
    try {
      collections = await fs.readdir(LANCEDB_PATH);
    } catch {
      // Ignore
    }
  }

  return {
    available,
    path: LANCEDB_PATH,
    stale: !!stalenessMessage,
    stalenessMessage,
    collections,
  };
}

/**
 * Format VectorDB diagnostics for display
 *
 * @param diagnostics - Diagnostics from getVectorDbDiagnostics
 * @returns Formatted string for display
 */
export function formatVectorDbDiagnostics(diagnostics: Awaited<ReturnType<typeof getVectorDbDiagnostics>>): string {
  const lines: string[] = [];

  if (diagnostics.available) {
    lines.push('✓ VectorDB available');
    lines.push(`  Path: ${diagnostics.path}`);
    lines.push(`  Collections: ${diagnostics.collections.join(', ') || 'none'}`);
    if (diagnostics.stale) {
      lines.push(`  ⚠️  ${diagnostics.stalenessMessage}`);
    }
  } else {
    lines.push('✗ VectorDB NOT available');
    lines.push(`  Expected path: ${diagnostics.path}`);
    lines.push('  Run `npm run seed-context` to initialize');
  }

  return lines.join('\n');
}
