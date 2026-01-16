/**
 * Sessions Create Command
 *
 * Creates a new discovery session with either:
 * - Natural language prompt (triggers enhancement flow)
 * - Direct parameter mode (--destination, --dates, etc.)
 *
 * @module cli/commands/sessions/create
 * @see PRD Section 16 - CLI Interface
 * @see Task 23.1 - Sessions Create Command
 */

import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import { getBaseCommand, EXIT_CODES } from '../../base-command.js';
import { createSpinner } from '../../formatters/progress.js';
import { saveSession, sessionExists } from '../../../storage/sessions.js';
import { SessionSchema, type Session } from '../../../schemas/session.js';
import {
  type EnhancementConfig,
  DEFAULT_ENHANCEMENT_CONFIG,
} from '../../../schemas/enhancement.js';
import type { Flexibility } from '../../../schemas/common.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for the sessions:create command.
 */
export interface CreateSessionOptions {
  /** Natural language prompt (triggers enhancement) */
  prompt?: string;
  /** Skip enhancement stage entirely */
  skipEnhancement?: boolean;
  /** Model to use for enhancement */
  enhancementModel?: 'gemini' | 'gpt' | 'claude';
  /** Auto-accept first enhancement suggestion */
  autoEnhance?: boolean;
  /** Destination(s) for direct parameter mode */
  destination?: string[];
  /** Travel dates (start and end) */
  dates?: string;
  /** Date flexibility setting */
  flexibility?: string;
  /** User interests (comma-separated) */
  interests?: string;
  /** Constraints (repeatable) */
  constraint?: string[];
  /** Session ID to seed parameters from */
  seedFrom?: string;
  /** External file to seed parameters from */
  seedFile?: string;
  /** Session title (auto-generated if not provided) */
  title?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a session ID from the current date and title.
 *
 * @param title - Session title to slugify
 * @returns Session ID in format YYYYMMDD-slug
 */
function generateSessionId(title: string): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 30)
    .replace(/^-|-$/g, '');

  return `${dateStr}-${slug || 'session'}`;
}

/**
 * Generate a title from destinations and interests.
 *
 * @param destinations - List of destinations
 * @param interests - List of interests
 * @returns Generated title
 */
function generateTitle(destinations: string[], interests: string[]): string {
  const dest = destinations.slice(0, 2).join(' & ');
  const int = interests.slice(0, 2).join(' ');
  return `${dest} ${int}`.trim() || 'Travel Discovery Session';
}

/**
 * Parse date range from string.
 *
 * @param datesStr - Dates string in format "YYYY-MM-DD to YYYY-MM-DD" or "YYYY-MM-DD,YYYY-MM-DD"
 * @returns DateRange object
 * @throws Error if format is invalid
 */
function parseDateRange(datesStr: string): { start: string; end: string } {
  // Support "YYYY-MM-DD to YYYY-MM-DD" or "YYYY-MM-DD,YYYY-MM-DD"
  const parts = datesStr.split(/\s*(?:to|,)\s*/i);
  if (parts.length !== 2) {
    throw new Error('Dates must be in format "YYYY-MM-DD to YYYY-MM-DD" or "YYYY-MM-DD,YYYY-MM-DD"');
  }

  const [start, end] = parts;
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

  if (!dateRegex.test(start) || !dateRegex.test(end)) {
    throw new Error('Dates must be in YYYY-MM-DD format');
  }

  if (new Date(start) > new Date(end)) {
    throw new Error('Start date must be before or equal to end date');
  }

  return { start, end };
}

/**
 * Parse flexibility option.
 *
 * @param flexStr - Flexibility string: "none", "plusMinus:N", or "monthOnly:YYYY-MM"
 * @returns Flexibility object
 */
function parseFlexibility(flexStr: string): Flexibility {
  if (flexStr === 'none') {
    return { type: 'none' };
  }

  if (flexStr.startsWith('plusMinus:')) {
    const days = parseInt(flexStr.split(':')[1], 10);
    if (isNaN(days) || days < 1 || days > 30) {
      throw new Error('plusMinus days must be between 1 and 30');
    }
    return { type: 'plusMinusDays', days };
  }

  if (flexStr.startsWith('monthOnly:')) {
    const month = flexStr.split(':')[1];
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new Error('monthOnly must be in YYYY-MM format');
    }
    return { type: 'monthOnly', month };
  }

  throw new Error('Flexibility must be "none", "plusMinus:N", or "monthOnly:YYYY-MM"');
}

/**
 * Parse comma-separated interests.
 *
 * @param interestsStr - Comma-separated interests
 * @returns Array of interests
 */
function parseInterests(interestsStr: string): string[] {
  return interestsStr
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Parse constraints from repeatable flags.
 *
 * @param constraints - Array of constraint strings in format "key:value" or "key=value"
 * @returns Constraints object
 */
function parseConstraints(constraints: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const constraint of constraints) {
    const match = constraint.match(/^([^:=]+)[:=](.+)$/);
    if (match) {
      const [, key, value] = match;
      // Try to parse as JSON, otherwise use as string
      try {
        result[key.trim()] = JSON.parse(value);
      } catch {
        result[key.trim()] = value.trim();
      }
    }
  }

  return result;
}

/**
 * Load seed parameters from an existing session.
 *
 * @param sessionId - Session ID to load from
 * @returns Partial session parameters
 */
async function loadSeedFromSession(
  sessionId: string
): Promise<Partial<Pick<Session, 'destinations' | 'dateRange' | 'flexibility' | 'interests' | 'constraints'>>> {
  const { loadSession } = await import('../../../storage/sessions.js');
  const session = await loadSession(sessionId);

  return {
    destinations: session.destinations,
    dateRange: session.dateRange,
    flexibility: session.flexibility,
    interests: session.interests,
    constraints: session.constraints,
  };
}

/**
 * Load seed parameters from an external JSON file.
 *
 * @param filePath - Path to JSON file
 * @returns Parsed JSON content
 */
async function loadSeedFromFile(filePath: string): Promise<Record<string, unknown>> {
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register the sessions:create command.
 *
 * @param sessionsCmd - Parent sessions command
 */
export function registerCreateCommand(sessionsCmd: Command): void {
  sessionsCmd
    .command('create')
    .description('Create a new discovery session')
    .option('-p, --prompt <text>', 'Natural language travel query (triggers enhancement)')
    .option('--skip-enhancement', 'Skip the prompt enhancement stage')
    .option(
      '--enhancement-model <model>',
      'Model for enhancement (gemini, gpt, claude)',
      'gemini'
    )
    .option('--auto-enhance', 'Auto-accept first enhancement suggestion')
    .option(
      '-d, --destination <place>',
      'Destination location (repeatable)',
      (val: string, prev: string[]) => [...prev, val],
      [] as string[]
    )
    .option('--dates <range>', 'Travel dates (YYYY-MM-DD to YYYY-MM-DD)')
    .option(
      '--flexibility <type>',
      'Date flexibility: none, plusMinus:N, monthOnly:YYYY-MM',
      'none'
    )
    .option('-i, --interests <list>', 'Interests/activities (comma-separated)')
    .option(
      '-c, --constraint <key:value>',
      'Add constraint (repeatable)',
      (val: string, prev: string[]) => [...prev, val],
      [] as string[]
    )
    .option('--seed-from <sessionId>', 'Seed parameters from existing session')
    .option('--seed-file <path>', 'Seed parameters from JSON file')
    .option('-t, --title <text>', 'Session title (auto-generated if not provided)')
    .action(async (options: CreateSessionOptions, cmd: Command) => {
      const base = getBaseCommand(cmd.parent!.parent!);

      try {
        await handleCreate(options, base);
      } catch (error) {
        if (error instanceof Error) {
          base.error(error.message, EXIT_CODES.ERROR);
        }
        throw error;
      }
    });
}

/**
 * Handle the sessions:create command.
 *
 * @param options - Command options
 * @param base - Base command for output
 */
async function handleCreate(
  options: CreateSessionOptions,
  base: ReturnType<typeof getBaseCommand>
): Promise<void> {
  const spinner = createSpinner('Creating session...');

  // Determine input mode
  const hasPrompt = !!options.prompt;
  const hasDirectParams = options.destination && options.destination.length > 0;

  if (!hasPrompt && !hasDirectParams && !options.seedFrom && !options.seedFile) {
    base.error(
      'Must provide either --prompt for natural language input, ' +
        '--destination for direct mode, or --seed-from/--seed-file for seeding',
      EXIT_CODES.USAGE_ERROR
    );
  }

  // Start building session parameters
  let destinations: string[] = [];
  let dateRange: { start: string; end: string } | undefined;
  let flexibility: Flexibility = { type: 'none' };
  let interests: string[] = [];
  let constraints: Record<string, unknown> = {};

  // Load seed parameters if specified
  if (options.seedFrom) {
    spinner.update('Loading seed from session...');
    base.debug(`Loading seed from session: ${options.seedFrom}`);

    try {
      const seed = await loadSeedFromSession(options.seedFrom);
      destinations = seed.destinations || [];
      dateRange = seed.dateRange;
      flexibility = seed.flexibility || { type: 'none' };
      interests = seed.interests || [];
      constraints = seed.constraints || {};
    } catch (error) {
      base.error(
        `Failed to load seed session: ${error instanceof Error ? error.message : String(error)}`,
        EXIT_CODES.NOT_FOUND
      );
    }
  }

  if (options.seedFile) {
    spinner.update('Loading seed from file...');
    base.debug(`Loading seed from file: ${options.seedFile}`);

    try {
      const seed = await loadSeedFromFile(options.seedFile);
      if (Array.isArray(seed.destinations)) destinations = seed.destinations as string[];
      if (seed.dateRange) dateRange = seed.dateRange as { start: string; end: string };
      if (seed.flexibility) flexibility = seed.flexibility as Flexibility;
      if (Array.isArray(seed.interests)) interests = seed.interests as string[];
      if (seed.constraints) constraints = seed.constraints as Record<string, unknown>;
    } catch (error) {
      base.error(
        `Failed to load seed file: ${error instanceof Error ? error.message : String(error)}`,
        EXIT_CODES.ERROR
      );
    }
  }

  // Override with direct parameters
  if (options.destination && options.destination.length > 0) {
    destinations = options.destination;
  }

  if (options.dates) {
    dateRange = parseDateRange(options.dates);
  }

  if (options.flexibility) {
    flexibility = parseFlexibility(options.flexibility);
  }

  if (options.interests) {
    interests = parseInterests(options.interests);
  }

  if (options.constraint && options.constraint.length > 0) {
    constraints = { ...constraints, ...parseConstraints(options.constraint) };
  }

  // Handle prompt mode (enhancement)
  if (hasPrompt && !options.skipEnhancement) {
    spinner.update('Analyzing prompt...');
    base.info(`Processing prompt: "${options.prompt}"`);

    // Build enhancement config
    const enhancementConfig: EnhancementConfig = {
      ...DEFAULT_ENHANCEMENT_CONFIG,
      skip: false,
      model: options.enhancementModel || 'gemini',
      autoEnhance: options.autoEnhance || false,
    };

    base.debug('Enhancement config:', enhancementConfig);

    // TODO: Integration with actual enhancement stage
    // For now, extract basic parameters from prompt
    base.warn('Enhancement stage not yet integrated - using basic extraction');

    // Basic prompt parsing (placeholder for full enhancement)
    if (!destinations.length) {
      // Try to extract destinations from prompt
      const prompt = options.prompt!.toLowerCase();
      const commonDestinations = ['tokyo', 'paris', 'london', 'new york', 'rome', 'barcelona'];
      for (const dest of commonDestinations) {
        if (prompt.includes(dest)) {
          destinations.push(dest.charAt(0).toUpperCase() + dest.slice(1));
        }
      }
      if (!destinations.length) {
        destinations = ['Unknown Destination'];
      }
    }

    if (!interests.length) {
      // Try to extract interests from prompt
      const prompt = options.prompt!.toLowerCase();
      const commonInterests = ['food', 'culture', 'history', 'nature', 'adventure', 'shopping', 'art'];
      for (const int of commonInterests) {
        if (prompt.includes(int)) {
          interests.push(int);
        }
      }
      if (!interests.length) {
        interests = ['general exploration'];
      }
    }
  }

  // Validate required fields
  if (!destinations.length) {
    base.error('At least one destination is required', EXIT_CODES.USAGE_ERROR);
  }

  if (!interests.length) {
    base.error('At least one interest is required', EXIT_CODES.USAGE_ERROR);
  }

  if (!dateRange) {
    // Default to next month
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 7);
    dateRange = {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    };
    base.warn(`No dates specified, defaulting to: ${dateRange.start} to ${dateRange.end}`);
  }

  // Generate session ID and title
  const title = options.title || generateTitle(destinations, interests);
  let sessionId = generateSessionId(title);

  // Ensure unique session ID
  let attempt = 0;
  while (await sessionExists(sessionId)) {
    attempt++;
    sessionId = `${generateSessionId(title)}-${attempt}`;
  }

  // Create session object
  const session: Session = SessionSchema.parse({
    sessionId,
    title,
    destinations,
    dateRange,
    flexibility,
    interests,
    constraints: Object.keys(constraints).length > 0 ? constraints : undefined,
    createdAt: new Date().toISOString(),
  });

  // Save session
  spinner.update('Saving session...');
  await saveSession(session);

  spinner.stop();

  // Display success
  base.success(`Session created: ${sessionId}`);
  base.blank();
  base.keyValue('Session ID', sessionId);
  base.keyValue('Title', title);
  base.keyValue('Destinations', destinations.join(', '));
  base.keyValue('Dates', `${dateRange.start} to ${dateRange.end}`);
  base.keyValue('Flexibility', JSON.stringify(flexibility));
  base.keyValue('Interests', interests.join(', '));
  if (Object.keys(constraints).length > 0) {
    base.keyValue('Constraints', JSON.stringify(constraints));
  }
  base.blank();
  base.info(`Next: Run "travel discover ${sessionId}" to start discovery`);
}

export default registerCreateCommand;
