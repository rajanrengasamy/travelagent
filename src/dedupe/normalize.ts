/**
 * Content Normalization for Deduplication
 *
 * Normalizes text content to enable consistent comparison and hash generation.
 * Used in Stage 05 (Deduplication & Clustering) for candidate matching.
 *
 * @see PRD Section 14.1 - Two-Phase Deduplication Strategy
 * @module dedupe/normalize
 */

/**
 * Extended emoji regex covering Unicode emoji ranges.
 *
 * Covers:
 * - Emoticons (1F600-1F64F)
 * - Miscellaneous Symbols and Pictographs (1F300-1F5FF)
 * - Transport and Map Symbols (1F680-1F6FF)
 * - Flags (1F1E0-1F1FF)
 * - Miscellaneous Symbols (2600-26FF)
 * - Dingbats (2700-27BF)
 * - Supplemental Symbols and Pictographs (1F900-1F9FF)
 * - Symbols and Pictographs Extended-A (1FA00-1FAFF)
 * - Additional misc symbols (231A-23FA, 25AA-25FE, etc.)
 */
const EMOJI_REGEX =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{231A}-\u{231B}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{2614}-\u{2615}\u{2648}-\u{2653}\u{267F}\u{2693}\u{26A1}\u{26AA}-\u{26AB}\u{26BD}-\u{26BE}\u{26C4}-\u{26C5}\u{26CE}\u{26D4}\u{26EA}\u{26F2}-\u{26F3}\u{26F5}\u{26FA}\u{26FD}\u{2702}\u{2705}\u{2708}-\u{270D}\u{270F}]/gu;

/**
 * Normalize content for deduplication comparison.
 *
 * Applies the following transformations in order:
 * 1. Lowercase all characters
 * 2. Remove URLs (http/https)
 * 3. Remove emoji (extended Unicode ranges)
 * 4. Remove punctuation (keep only word characters and whitespace)
 * 5. Collapse multiple whitespace to single space
 * 6. Trim leading/trailing whitespace
 *
 * @param content - The raw content string to normalize
 * @returns Normalized content string suitable for comparison/hashing
 *
 * @example
 * ```typescript
 * normalizeContent('Check out https://example.com for the Best Restaurants!');
 * // Returns: 'check out for the best restaurants'
 *
 * normalizeContent('Tokyo Tower - Amazing View! ');
 * // Returns: 'tokyo tower amazing view'
 * ```
 */
export function normalizeContent(content: string): string {
  if (!content) {
    return '';
  }

  return content
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '') // Remove URLs
    .replace(EMOJI_REGEX, '') // Remove emoji (extended range)
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim();
}
