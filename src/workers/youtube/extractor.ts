/**
 * YouTube Candidate Extractor
 *
 * Uses LLM (Gemini Flash) to extract travel candidates from
 * YouTube video transcripts. Parses responses into candidate objects
 * with proper origin, confidence, and metadata.
 *
 * @module workers/youtube/extractor
 * @see PRD Section 15.7 - Extraction Prompt
 * @see Task 11.5 - LLM Extraction
 */

import { createHash } from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { requireApiKey } from '../../config/index.js';
import { getModelConfig } from '../../config/models.js';
import type { Candidate, CandidateType, SourceRef } from '../../schemas/candidate.js';
import type { VideoDetails } from './client.js';
import {
  buildExtractionPrompt,
  YOUTUBE_EXTRACTION_SYSTEM_PROMPT,
  type ExtractedRecommendation,
} from './prompts.js';

// ============================================================================
// Types
// ============================================================================

/**
 * YouTube-specific candidate with video metadata
 */
export interface YouTubeCandidate extends Candidate {
  origin: 'youtube';
  confidence: 'provisional';
  metadata: {
    videoId: string;
    channelName: string;
    viewCount: number;
    publishedAt: string;
    timestampSeconds?: number;
  };
}

/**
 * Options for candidate extraction
 */
export interface ExtractionOptions {
  /** Maximum candidates to extract per video (default: 10) */
  maxCandidatesPerVideo?: number;
  /** Timeout for LLM call in milliseconds (default: 15000) */
  timeoutMs?: number;
}

/**
 * Result of extraction with token usage
 */
export interface ExtractionResult {
  /** Extracted candidates */
  candidates: YouTubeCandidate[];
  /** Token usage for cost tracking */
  tokenUsage: {
    input: number;
    output: number;
  };
}

// ============================================================================
// Zod Schema for Response Validation
// ============================================================================

const ExtractedRecommendationSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['food', 'place', 'activity', 'neighborhood', 'daytrip', 'experience']),
  description: z.string().min(1),
  location: z.string().nullable().optional(),
  timestampSeconds: z.number().nonnegative().optional(),
});

const ExtractionResponseSchema = z.array(ExtractedRecommendationSchema);

// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * Extract travel candidates from a video transcript using LLM.
 *
 * Uses Gemini Flash for fast, cost-effective extraction.
 *
 * @param transcript - Full video transcript text
 * @param video - Video metadata
 * @param destination - Primary destination for context
 * @param options - Extraction options
 * @returns Array of YouTube candidates with proper metadata
 *
 * @example
 * ```typescript
 * const candidates = await extractCandidatesFromTranscript(
 *   'Today we explore the best ramen shops in Tokyo...',
 *   { videoId: 'abc123', title: 'Tokyo Food Guide', ... },
 *   'Tokyo'
 * );
 * ```
 */
export async function extractCandidatesFromTranscript(
  transcript: string,
  video: VideoDetails,
  destination: string,
  options: ExtractionOptions = {}
): Promise<ExtractionResult> {
  const maxCandidates = options.maxCandidatesPerVideo ?? 10;
  const timeoutMs = options.timeoutMs ?? 15000;

  // MAJ-2: Early return for empty/short transcripts to avoid wasting LLM tokens
  if (!transcript || transcript.trim().length < 50) {
    return { candidates: [], tokenUsage: { input: 0, output: 0 } };
  }

  // Get model configuration
  const modelConfig = getModelConfig('youtube');

  // Initialize Gemini client
  const apiKey = requireApiKey('googleAi');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelConfig.modelId,
    generationConfig: {
      temperature: modelConfig.temperature,
      maxOutputTokens: modelConfig.maxOutputTokens,
    },
  });

  // Build the extraction prompt
  const prompt = buildExtractionPrompt(
    transcript,
    video.title,
    destination,
    video.channelTitle
  );

  // Build full prompt with system context
  const fullPrompt = `${YOUTUBE_EXTRACTION_SYSTEM_PROMPT}\n\n${prompt}`;

  // Call LLM with timeout
  const result = await callWithTimeout(
    async () => {
      const response = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig: {
          temperature: modelConfig.temperature,
          maxOutputTokens: modelConfig.maxOutputTokens,
        },
      });
      return response;
    },
    timeoutMs
  );

  // Extract text and token usage from response
  const responseText = result.response.text();
  // CRIT-2: Defensive handling for usageMetadata with fallbacks
  // Per SDK types: promptTokenCount, candidatesTokenCount, totalTokenCount are defined
  // Fallback to totalTokenCount for input if promptTokenCount missing (edge case)
  // Fallback to (total - prompt) for output as last resort
  const usageMetadata = result.response?.usageMetadata;
  const promptTokens = usageMetadata?.promptTokenCount ?? usageMetadata?.totalTokenCount ?? 0;
  const candidateTokens = usageMetadata?.candidatesTokenCount ??
    (usageMetadata?.totalTokenCount && usageMetadata?.promptTokenCount
      ? usageMetadata.totalTokenCount - usageMetadata.promptTokenCount
      : 0);
  const tokenUsage = {
    input: promptTokens,
    output: candidateTokens,
  };

  // Parse the response
  const recommendations = parseExtractionResponse(responseText);

  // Convert recommendations to candidates
  const candidates = recommendations
    .slice(0, maxCandidates)
    .map((rec) => recommendationToCandidate(rec, video, destination));

  return { candidates, tokenUsage };
}

/**
 * Extract candidates from multiple videos in parallel.
 *
 * @param videos - Array of videos with transcripts
 * @param destination - Primary destination
 * @param options - Extraction options
 * @returns Combined extraction results
 */
export async function extractCandidatesFromVideos(
  videos: Array<{ video: VideoDetails; transcript: string }>,
  destination: string,
  options: ExtractionOptions = {}
): Promise<ExtractionResult> {
  const allCandidates: YouTubeCandidate[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Process videos sequentially to avoid rate limits
  for (const { video, transcript } of videos) {
    try {
      const result = await extractCandidatesFromTranscript(
        transcript,
        video,
        destination,
        options
      );

      allCandidates.push(...result.candidates);
      totalInputTokens += result.tokenUsage.input;
      totalOutputTokens += result.tokenUsage.output;
    } catch (error) {
      // Log error but continue with other videos
      console.warn(
        `Failed to extract from video ${video.videoId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  return {
    candidates: allCandidates,
    tokenUsage: {
      input: totalInputTokens,
      output: totalOutputTokens,
    },
  };
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Parse LLM extraction response into typed recommendations.
 *
 * Handles common JSON formatting issues in LLM responses.
 *
 * @param responseText - Raw LLM response text
 * @returns Array of extracted recommendations
 */
export function parseExtractionResponse(responseText: string): ExtractedRecommendation[] {
  // Try to extract JSON from the response
  const jsonText = extractJsonFromResponse(responseText);

  if (!jsonText) {
    console.warn('No valid JSON found in extraction response');
    return [];
  }

  try {
    const parsed = JSON.parse(jsonText);

    // Validate with Zod
    const validated = ExtractionResponseSchema.safeParse(parsed);

    if (validated.success) {
      return validated.data;
    }

    // If validation fails, try to salvage what we can
    console.warn('Response validation failed, attempting partial recovery');
    return recoverPartialRecommendations(parsed);
  } catch (error) {
    console.warn(`Failed to parse extraction response: ${error}`);
    return [];
  }
}

/**
 * Extract JSON array from potentially messy LLM response.
 *
 * Handles cases like:
 * - JSON wrapped in markdown code blocks
 * - Extra text before/after JSON
 * - Slightly malformed JSON
 */
function extractJsonFromResponse(text: string): string | null {
  // Remove markdown code blocks
  let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '');

  // Try to find array boundaries
  const startBracket = cleaned.indexOf('[');
  const endBracket = cleaned.lastIndexOf(']');

  if (startBracket !== -1 && endBracket !== -1 && endBracket > startBracket) {
    return cleaned.substring(startBracket, endBracket + 1);
  }

  // If no array found, try the whole cleaned text
  cleaned = cleaned.trim();
  if (cleaned.startsWith('[')) {
    return cleaned;
  }

  return null;
}

/**
 * Try to recover valid recommendations from partially valid data.
 */
function recoverPartialRecommendations(data: unknown): ExtractedRecommendation[] {
  if (!Array.isArray(data)) {
    return [];
  }

  const valid: ExtractedRecommendation[] = [];

  for (const item of data) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }

    const rec = item as Record<string, unknown>;

    // Check required fields
    if (
      typeof rec.name === 'string' &&
      rec.name.length > 0 &&
      typeof rec.type === 'string' &&
      ['food', 'place', 'activity', 'neighborhood', 'daytrip', 'experience'].includes(rec.type)
    ) {
      valid.push({
        name: rec.name,
        type: rec.type as ExtractedRecommendation['type'],
        description: typeof rec.description === 'string' ? rec.description : '',
        location: typeof rec.location === 'string' ? rec.location : undefined,
        timestampSeconds:
          typeof rec.timestampSeconds === 'number' ? rec.timestampSeconds : undefined,
      });
    }
  }

  return valid;
}

// ============================================================================
// Candidate Conversion
// ============================================================================

/**
 * Convert an extracted recommendation to a YouTube candidate.
 *
 * @param recommendation - Extracted recommendation from LLM
 * @param video - Source video metadata
 * @param destination - Destination context
 * @returns YouTube candidate with proper metadata
 */
export function recommendationToCandidate(
  recommendation: ExtractedRecommendation,
  video: VideoDetails,
  destination: string
): YouTubeCandidate {
  const now = new Date().toISOString();

  // Generate YouTube URL with timestamp if available
  const timestampParam = recommendation.timestampSeconds
    ? `&t=${recommendation.timestampSeconds}`
    : '';
  const videoUrl = `https://youtube.com/watch?v=${video.videoId}${timestampParam}`;

  // Create source reference
  const sourceRef: SourceRef = {
    url: videoUrl,
    publisher: video.channelTitle,
    retrievedAt: now,
    snippet: recommendation.description.substring(0, 200),
  };

  // Generate stable candidate ID
  const candidateId = generateYouTubeCandidateId(
    recommendation.name,
    video.videoId,
    destination
  );

  // Map recommendation type to candidate type
  const candidateType: CandidateType = recommendation.type;

  // Build location text
  const locationText = recommendation.location
    ? `${recommendation.location}, ${destination}`
    : destination;

  // Infer tags from type and description
  const tags = inferTags(candidateType, recommendation.description);

  return {
    candidateId,
    type: candidateType,
    title: recommendation.name,
    summary: recommendation.description,
    locationText,
    tags,
    origin: 'youtube',
    sourceRefs: [sourceRef],
    confidence: 'provisional',
    score: 30, // Default score for YouTube candidates (lower credibility per PRD)
    metadata: {
      videoId: video.videoId,
      channelName: video.channelTitle,
      viewCount: video.viewCount,
      publishedAt: video.publishedAt,
      timestampSeconds: recommendation.timestampSeconds,
    },
  };
}

/**
 * Generate a stable candidate ID for YouTube-derived candidates.
 *
 * Uses SHA-256 hash of name, video ID, and destination.
 */
function generateYouTubeCandidateId(
  name: string,
  videoId: string,
  destination: string
): string {
  const seed = `youtube|${name.toLowerCase().trim()}|${videoId}|${destination.toLowerCase().trim()}`;
  return createHash('sha256').update(seed).digest('hex').slice(0, 16);
}

/**
 * Infer tags from candidate type and description.
 */
function inferTags(type: CandidateType, description: string): string[] {
  const tags: string[] = [type, 'youtube'];
  const lowerDesc = description.toLowerCase();

  // Add relevant tags based on content
  const tagMappings: Record<string, string[]> = {
    restaurant: ['dining'],
    cafe: ['cafe', 'coffee'],
    street: ['street-food'],
    market: ['market', 'shopping'],
    temple: ['temple', 'culture', 'history'],
    shrine: ['shrine', 'culture', 'history'],
    museum: ['museum', 'culture'],
    beach: ['beach', 'nature'],
    hike: ['hiking', 'nature', 'outdoors'],
    tour: ['tour', 'guided'],
    local: ['local', 'authentic'],
    hidden: ['hidden-gem', 'off-the-beaten-path'],
    famous: ['popular', 'must-see'],
    instagram: ['photogenic', 'instagram'],
    sunset: ['sunset', 'scenic'],
    night: ['nightlife'],
    family: ['family-friendly'],
  };

  for (const [keyword, relatedTags] of Object.entries(tagMappings)) {
    if (lowerDesc.includes(keyword)) {
      for (const tag of relatedTags) {
        if (!tags.includes(tag)) {
          tags.push(tag);
        }
      }
    }
  }

  return tags;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Execute a function with timeout.
 * CRIT-1: Properly cleans up timeout to prevent resource leaks
 */
async function callWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    const result = await Promise.race([fn(), timeoutPromise]);
    return result;
  } finally {
    clearTimeout(timeoutId!);
  }
}
