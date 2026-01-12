/**
 * Session and Run ID Generation
 *
 * Generates human-readable IDs for sessions and runs following PRD Section 11.1.
 *
 * Session ID Format: YYYYMMDD-<slug>
 * Run ID Format: YYYYMMDD-HHMMSS[-mode]
 *
 * @module sessions/id-generator
 */

/**
 * Stopwords to remove from slugs
 */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'trip', 'plan', 'to', 'in', 'for', 'my', 'our',
]);

/**
 * Maximum slug length in characters
 */
const MAX_SLUG_LENGTH = 50;

/**
 * Regex to match emoji characters
 */
const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{231A}-\u{231B}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{2614}-\u{2615}\u{2648}-\u{2653}\u{267F}\u{2693}\u{26A1}\u{26AA}-\u{26AB}\u{26BD}-\u{26BE}\u{26C4}-\u{26C5}\u{26CE}\u{26D4}\u{26EA}\u{26F2}-\u{26F3}\u{26F5}\u{26FA}\u{26FD}\u{2702}\u{2705}\u{2708}-\u{270D}\u{270F}]/gu;

/**
 * Generate a URL-friendly slug from tokens.
 *
 * Rules applied in order:
 * 1. Lowercase all characters
 * 2. Replace spaces and special characters with hyphens
 * 3. Remove stopwords
 * 4. Remove emoji and punctuation (keep only alphanumeric and hyphens)
 * 5. Collapse multiple hyphens to single hyphen
 * 6. Trim leading/trailing hyphens
 * 7. Truncate to max 50 characters at word boundary
 *
 * @param tokens - Array of tokens to convert to slug
 * @returns URL-friendly slug string
 *
 * @example
 * ```typescript
 * generateSlug(['Japan', 'April', 'temples', 'food', 'family', 'trip']);
 * // Returns: 'japan-april-temples-food-family'
 * ```
 */
export function generateSlug(tokens: string[]): string {
  if (!tokens || tokens.length === 0) {
    return 'session';
  }

  // Join tokens and process
  let slug = tokens
    .join(' ')
    // Lowercase
    .toLowerCase()
    // Remove emoji
    .replace(EMOJI_REGEX, '')
    // Replace special characters and spaces with hyphens
    .replace(/[^a-z0-9]+/g, '-')
    // Split into words for stopword removal
    .split('-')
    // Remove stopwords and empty strings
    .filter((word) => word.length > 0 && !STOPWORDS.has(word))
    // Rejoin
    .join('-');

  // Collapse multiple hyphens
  slug = slug.replace(/-+/g, '-');

  // Trim leading/trailing hyphens
  slug = slug.replace(/^-+|-+$/g, '');

  // Truncate to max length at word boundary
  if (slug.length > MAX_SLUG_LENGTH) {
    slug = slug.substring(0, MAX_SLUG_LENGTH);
    // Don't cut mid-word - find last hyphen
    const lastHyphen = slug.lastIndexOf('-');
    if (lastHyphen > 0) {
      slug = slug.substring(0, lastHyphen);
    }
  }

  // Handle edge case of empty result
  if (!slug) {
    return 'session';
  }

  return slug;
}

/**
 * Format a date as YYYYMMDD string.
 *
 * @param date - Date to format (defaults to now)
 * @returns Date string in YYYYMMDD format
 */
function formatDateYYYYMMDD(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Format a date as YYYYMMDD-HHMMSS string.
 *
 * @param date - Date to format (defaults to now)
 * @returns Date string in YYYYMMDD-HHMMSS format
 */
function formatTimestamp(date: Date = new Date()): string {
  const dateStr = formatDateYYYYMMDD(date);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${dateStr}-${hours}${minutes}${seconds}`;
}

/**
 * Extract meaningful tokens from a prompt string.
 *
 * @param prompt - User's original prompt
 * @returns Array of extracted tokens
 */
function extractTokensFromPrompt(prompt: string): string[] {
  if (!prompt) return [];

  // Split on common delimiters and filter
  return prompt
    .split(/[,;:\-\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}

/**
 * Generate a human-readable session ID.
 *
 * Format: YYYYMMDD-<slug>
 *
 * The slug is derived from the prompt, destinations, and interests.
 *
 * @param prompt - User's original prompt (optional)
 * @param destinations - Array of destination names
 * @param interests - Array of interest tags
 * @returns Session ID string
 *
 * @example
 * ```typescript
 * generateSessionId(
 *   'Japan trip in April',
 *   ['Tokyo', 'Kyoto'],
 *   ['temples', 'food']
 * );
 * // Returns: '20260107-japan-april-tokyo-kyoto-temples-food'
 * ```
 */
export function generateSessionId(
  prompt: string,
  destinations: string[],
  interests: string[]
): string {
  const dateStr = formatDateYYYYMMDD();

  // Collect tokens: destinations first (highest priority), then interests, then prompt tokens
  const tokens: string[] = [
    ...destinations,
    ...interests,
    ...extractTokensFromPrompt(prompt),
  ];

  const slug = generateSlug(tokens);

  return `${dateStr}-${slug}`;
}

/**
 * Handle session ID collision by appending a numeric suffix.
 *
 * If the base ID doesn't exist, returns it unchanged.
 * Otherwise appends -2, -3, etc. until a unique ID is found.
 *
 * @param baseId - The original session ID
 * @param existingIds - Array of existing session IDs to check against
 * @returns A unique session ID
 *
 * @example
 * ```typescript
 * handleCollision('20260107-japan', ['20260107-japan', '20260107-japan-2']);
 * // Returns: '20260107-japan-3'
 * ```
 */
export function handleCollision(baseId: string, existingIds: string[]): string {
  const existingSet = new Set(existingIds);

  if (!existingSet.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  let candidateId = `${baseId}-${suffix}`;

  while (existingSet.has(candidateId)) {
    suffix++;
    candidateId = `${baseId}-${suffix}`;
  }

  return candidateId;
}

/**
 * Generate a human-readable run ID.
 *
 * Format: YYYYMMDD-HHMMSS[-mode]
 *
 * @param mode - Optional mode string (e.g., 'full', 'from-08')
 * @returns Run ID string
 *
 * @example
 * ```typescript
 * generateRunId('full');
 * // Returns: '20260107-143512-full'
 *
 * generateRunId();
 * // Returns: '20260107-143512'
 * ```
 */
export function generateRunId(mode?: string): string {
  const timestamp = formatTimestamp();

  if (mode) {
    return `${timestamp}-${mode}`;
  }

  return timestamp;
}
