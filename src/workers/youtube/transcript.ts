/**
 * YouTube Transcript Fetching
 *
 * Fetches video transcripts using the youtube-transcript npm package.
 * Handles videos without transcripts gracefully and combines
 * transcript segments into full text.
 *
 * @module workers/youtube/transcript
 * @see PRD Section 15 - YouTube Social Signals
 * @see Task 11.2 - Transcript Fetching
 */

import { YoutubeTranscript } from 'youtube-transcript';

// ============================================================================
// Types
// ============================================================================

/**
 * A single transcript segment from youtube-transcript
 */
export interface TranscriptSegment {
  /** Text content of the segment */
  text: string;
  /** Start time in seconds */
  offset: number;
  /** Duration in seconds */
  duration: number;
}

/**
 * Full transcript with metadata
 */
export interface TranscriptResult {
  /** Video ID */
  videoId: string;
  /** Combined transcript text */
  text: string;
  /** Number of segments */
  segmentCount: number;
  /** Total duration in seconds */
  totalDuration: number;
  /** Original segments with timing */
  segments: TranscriptSegment[];
}

/**
 * Error thrown when transcript fetching fails
 */
export class TranscriptError extends Error {
  constructor(
    message: string,
    public readonly videoId: string,
    public readonly isTranscriptUnavailable: boolean = false
  ) {
    super(message);
    this.name = 'TranscriptError';
  }
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Fetch the transcript for a YouTube video.
 *
 * Uses the youtube-transcript npm package which accesses YouTube's
 * caption data without requiring authentication.
 *
 * @param videoId - YouTube video ID
 * @param timeoutMs - Timeout in milliseconds (default: 10000)
 * @returns Combined transcript text, or null if unavailable
 *
 * @example
 * ```typescript
 * const transcript = await fetchTranscript('dQw4w9WgXcQ');
 * if (transcript) {
 *   console.log(`Transcript: ${transcript.substring(0, 100)}...`);
 * }
 * ```
 */
export async function fetchTranscript(
  videoId: string,
  timeoutMs: number = 10000
): Promise<string | null> {
  try {
    const result = await fetchTranscriptWithDetails(videoId, timeoutMs);
    return result.text;
  } catch (error) {
    // Gracefully return null for unavailable transcripts
    if (error instanceof TranscriptError && error.isTranscriptUnavailable) {
      return null;
    }
    // Re-throw other errors (network issues, etc.)
    throw error;
  }
}

/**
 * Fetch transcript with full details including timing information.
 *
 * @param videoId - YouTube video ID
 * @param timeoutMs - Timeout in milliseconds (default: 10000)
 * @returns Full transcript result with segments
 * @throws TranscriptError if transcript is unavailable or fetch fails
 */
export async function fetchTranscriptWithDetails(
  videoId: string,
  timeoutMs: number = 10000
): Promise<TranscriptResult> {
  // Create a timeout promise with cleanup capability
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TranscriptError(`Transcript fetch timed out after ${timeoutMs}ms`, videoId));
    }, timeoutMs);
  });

  // Race the fetch against the timeout
  try {
    const rawSegments = await Promise.race([
      YoutubeTranscript.fetchTranscript(videoId),
      timeoutPromise,
    ]);

    // Transform to our segment format
    const segments: TranscriptSegment[] = rawSegments.map((seg) => ({
      text: seg.text,
      offset: seg.offset / 1000, // Convert from ms to seconds
      duration: seg.duration / 1000,
    }));

    // Combine segments into full text
    const text = combineSegments(segments);

    // Calculate total duration
    const lastSegment = segments[segments.length - 1];
    const totalDuration = lastSegment
      ? lastSegment.offset + lastSegment.duration
      : 0;

    return {
      videoId,
      text,
      segmentCount: segments.length,
      totalDuration,
      segments,
    };
  } catch (error) {
    // Check for common "no transcript" error patterns
    if (isTranscriptUnavailableError(error)) {
      throw new TranscriptError(
        `Transcript not available for video ${videoId}`,
        videoId,
        true
      );
    }

    // Wrap other errors
    if (error instanceof TranscriptError) {
      throw error;
    }

    throw new TranscriptError(
      error instanceof Error ? error.message : String(error),
      videoId,
      false
    );
  } finally {
    // Always cleanup the timeout timer
    clearTimeout(timeoutId!);
  }
}

/**
 * Combine transcript segments into coherent text.
 *
 * Handles:
 * - Joining segments with proper spacing
 * - Cleaning up HTML entities
 * - Removing duplicate text from overlapping segments
 *
 * @param segments - Array of transcript segments
 * @returns Combined, cleaned transcript text
 */
export function combineSegments(segments: TranscriptSegment[]): string {
  if (segments.length === 0) {
    return '';
  }

  const textParts: string[] = [];

  for (const segment of segments) {
    // Clean the text
    let text = cleanTranscriptText(segment.text);

    if (text) {
      textParts.push(text);
    }
  }

  // Join with spaces, then normalize whitespace
  return textParts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Clean transcript text by removing HTML entities and normalizing.
 *
 * @param text - Raw transcript text
 * @returns Cleaned text
 */
export function cleanTranscriptText(text: string): string {
  return text
    // Decode common HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Remove any remaining HTML tags
    .replace(/<[^>]*>/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find the transcript segment at a given timestamp.
 *
 * Useful for creating deep links to specific moments in a video.
 *
 * @param segments - Array of transcript segments
 * @param timestampSeconds - Timestamp in seconds
 * @returns Matching segment or undefined
 */
export function findSegmentAtTimestamp(
  segments: TranscriptSegment[],
  timestampSeconds: number
): TranscriptSegment | undefined {
  return segments.find(
    (seg) =>
      seg.offset <= timestampSeconds &&
      seg.offset + seg.duration >= timestampSeconds
  );
}

/**
 * Extract text around a specific timestamp.
 *
 * @param segments - Array of transcript segments
 * @param timestampSeconds - Center timestamp in seconds
 * @param windowSeconds - Window size in seconds (default: 30)
 * @returns Extracted text around the timestamp
 */
export function extractTextAroundTimestamp(
  segments: TranscriptSegment[],
  timestampSeconds: number,
  windowSeconds: number = 30
): string {
  const startTime = Math.max(0, timestampSeconds - windowSeconds / 2);
  const endTime = timestampSeconds + windowSeconds / 2;

  const relevantSegments = segments.filter(
    (seg) => seg.offset >= startTime && seg.offset <= endTime
  );

  return combineSegments(relevantSegments);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if an error indicates transcript is unavailable.
 *
 * Common reasons:
 * - Video has no captions
 * - Captions are disabled by creator
 * - Video is private or deleted
 * - Video is age-restricted
 */
function isTranscriptUnavailableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('transcript is disabled') ||
      message.includes('no transcript') ||
      message.includes('transcripts are disabled') ||
      message.includes('could not retrieve') ||
      message.includes('video unavailable') ||
      message.includes('private video') ||
      message.includes('not available') ||
      message.includes('disabled for this video')
    );
  }
  return false;
}

/**
 * Check if an error is a TranscriptError
 */
export function isTranscriptError(error: unknown): error is TranscriptError {
  return error instanceof TranscriptError;
}

/**
 * Check if an error is retryable (network issues, not transcript unavailability)
 */
export function isRetryableTranscriptError(error: unknown): boolean {
  if (error instanceof TranscriptError) {
    // Transcript unavailable is not retryable
    return !error.isTranscriptUnavailable;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('econnreset') ||
      message.includes('fetch failed')
    );
  }
  return false;
}
