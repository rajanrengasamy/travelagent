/**
 * Session Context Cache
 *
 * Provides caching of retrieved context between Claude Code skills.
 * When /startagain retrieves context, it saves to cache.
 * When /develop or /qa run, they check cache first to avoid re-retrieval.
 *
 * Cache location: ~/.travelagent/context/.session-cache.json
 * Default TTL: 60 minutes
 *
 * @module context/session-cache
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { ContextBundle } from './types.js';

/**
 * Session cache file location
 */
const CACHE_DIR = path.join(os.homedir(), '.travelagent', 'context');
const CACHE_FILE = path.join(CACHE_DIR, '.session-cache.json');

/**
 * Default cache TTL in minutes
 */
const DEFAULT_CACHE_TTL_MINUTES = 60;

/**
 * Cached context bundle with metadata
 */
interface CachedContext {
  /** When the cache was written */
  cachedAt: string;
  /** The context bundle */
  bundle: ContextBundle;
  /** Optional focus query used during retrieval */
  query?: string;
}

/**
 * Ensure cache directory exists
 */
async function ensureCacheDir(): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (error) {
    // Ignore if already exists
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Save retrieved context to session cache
 *
 * Call this after /startagain retrieves context so subsequent
 * /develop and /qa calls can reuse it without re-retrieval.
 *
 * @param bundle - The context bundle to cache
 * @param query - Optional focus query used during retrieval
 */
export async function saveSessionCache(
  bundle: ContextBundle,
  query?: string
): Promise<void> {
  await ensureCacheDir();

  const cached: CachedContext = {
    cachedAt: new Date().toISOString(),
    bundle,
    query,
  };

  await fs.writeFile(CACHE_FILE, JSON.stringify(cached, null, 2), 'utf-8');
}

/**
 * Load context from session cache if fresh
 *
 * @param maxAgeMinutes - Maximum cache age in minutes (default: 60)
 * @returns The cached context bundle, or null if cache is stale/missing
 */
export async function loadSessionCache(
  maxAgeMinutes: number = DEFAULT_CACHE_TTL_MINUTES
): Promise<ContextBundle | null> {
  try {
    const content = await fs.readFile(CACHE_FILE, 'utf-8');
    const cached: CachedContext = JSON.parse(content);

    // Check if cache is fresh
    const cachedAt = new Date(cached.cachedAt);
    const now = new Date();
    const ageMinutes = (now.getTime() - cachedAt.getTime()) / (1000 * 60);

    if (ageMinutes > maxAgeMinutes) {
      // Cache is stale
      return null;
    }

    return cached.bundle;
  } catch {
    // Cache file doesn't exist or is invalid
    return null;
  }
}

/**
 * Check if session cache exists and is fresh
 *
 * @param maxAgeMinutes - Maximum cache age in minutes (default: 60)
 * @returns True if cache exists and is fresh
 */
export async function isSessionCacheFresh(
  maxAgeMinutes: number = DEFAULT_CACHE_TTL_MINUTES
): Promise<boolean> {
  try {
    const content = await fs.readFile(CACHE_FILE, 'utf-8');
    const cached: CachedContext = JSON.parse(content);

    const cachedAt = new Date(cached.cachedAt);
    const now = new Date();
    const ageMinutes = (now.getTime() - cachedAt.getTime()) / (1000 * 60);

    return ageMinutes <= maxAgeMinutes;
  } catch {
    return false;
  }
}

/**
 * Get cache age in minutes, or null if no cache exists
 *
 * @returns Age in minutes, or null if cache doesn't exist
 */
export async function getSessionCacheAge(): Promise<number | null> {
  try {
    const content = await fs.readFile(CACHE_FILE, 'utf-8');
    const cached: CachedContext = JSON.parse(content);

    const cachedAt = new Date(cached.cachedAt);
    const now = new Date();
    const ageMinutes = (now.getTime() - cachedAt.getTime()) / (1000 * 60);

    return Math.round(ageMinutes);
  } catch {
    return null;
  }
}

/**
 * Clear the session cache
 */
export async function clearSessionCache(): Promise<void> {
  try {
    await fs.unlink(CACHE_FILE);
  } catch {
    // Ignore if file doesn't exist
  }
}

/**
 * Get cache metadata without loading full bundle
 *
 * @returns Cache metadata, or null if cache doesn't exist
 */
export async function getSessionCacheInfo(): Promise<{
  cachedAt: string;
  ageMinutes: number;
  query?: string;
  sessionCount: number;
  prdSectionCount: number;
  journalEntryCount: number;
  todoLoaded: boolean;
} | null> {
  try {
    const content = await fs.readFile(CACHE_FILE, 'utf-8');
    const cached: CachedContext = JSON.parse(content);

    const cachedAt = new Date(cached.cachedAt);
    const now = new Date();
    const ageMinutes = Math.round((now.getTime() - cachedAt.getTime()) / (1000 * 60));

    return {
      cachedAt: cached.cachedAt,
      ageMinutes,
      query: cached.query,
      sessionCount: cached.bundle.recentSessions?.length ?? 0,
      prdSectionCount: cached.bundle.relevantPrdSections?.length ?? 0,
      journalEntryCount: cached.bundle.relevantJournalEntries?.length ?? 0,
      todoLoaded: cached.bundle.todoState !== null,
    };
  } catch {
    return null;
  }
}
