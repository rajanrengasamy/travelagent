/**
 * YouTube Extraction Prompts
 *
 * Prompt templates for extracting travel recommendations from
 * YouTube video transcripts using LLM.
 *
 * @module workers/youtube/prompts
 * @see PRD Section 15.7 - Extraction Prompt
 * @see Task 11.4 - Extraction Prompts
 */

import type { VideoDetails } from './client.js';

// ============================================================================
// Prompt Templates
// ============================================================================

/**
 * System prompt for YouTube transcript extraction.
 *
 * Sets context for the LLM to extract structured travel recommendations.
 */
export const YOUTUBE_EXTRACTION_SYSTEM_PROMPT = `You are a travel recommendation extractor. Your task is to identify specific, named travel recommendations from video transcripts.

Focus on extracting:
- Restaurants, cafes, and food spots
- Attractions and landmarks
- Activities and experiences
- Neighborhoods and areas to explore
- Day trip destinations

For each recommendation, provide:
- Exact name of the place/activity
- Type (food, place, activity, neighborhood, daytrip, experience)
- Brief description (1-2 sentences)
- Location within the city if mentioned
- Approximate timestamp in the video where it was mentioned

Only extract items with specific names. Skip generic references like "a nice restaurant" or "the beach".

Output as JSON array.`;

/**
 * Build an extraction prompt for a specific video transcript.
 *
 * Uses the format from PRD Section 15.7 / Appendix C.3.
 *
 * @param transcript - The video transcript text
 * @param videoTitle - Title of the video
 * @param destination - Primary destination being searched
 * @param channelName - Name of the YouTube channel
 * @returns Formatted prompt for LLM
 */
export function buildExtractionPrompt(
  transcript: string,
  videoTitle: string,
  destination: string,
  channelName: string
): string {
  // Truncate transcript if too long (keep first ~6000 chars to leave room for response)
  const maxTranscriptLength = 6000;
  const truncatedTranscript =
    transcript.length > maxTranscriptLength
      ? transcript.substring(0, maxTranscriptLength) + '... [transcript truncated]'
      : transcript;

  return `Extract travel recommendations from this video transcript about ${destination}.

Video: ${videoTitle}
Channel: ${channelName}

---
TRANSCRIPT:
${truncatedTranscript}
---

Extract all specific, named recommendations from this transcript. For each one, provide:

1. **name**: The exact name of the place, restaurant, or activity
2. **type**: One of: food, place, activity, neighborhood, daytrip, experience
3. **description**: Brief description based on what the video says (1-2 sentences)
4. **location**: More specific location if mentioned (e.g., "Shibuya" for Tokyo)
5. **timestampSeconds**: Approximate seconds into video where mentioned (estimate if needed)

Only include items with specific names. Skip generic references.

Return as JSON array:
[
  {
    "name": "Place Name",
    "type": "food|place|activity|neighborhood|daytrip|experience",
    "description": "Brief description from the video",
    "location": "Specific area or null",
    "timestampSeconds": 120
  }
]

If no specific recommendations are found, return an empty array: []`;
}

/**
 * Build a batch extraction prompt for multiple videos.
 *
 * More efficient for processing multiple transcripts at once.
 *
 * @param videos - Array of video data with transcripts
 * @param destination - Primary destination
 * @returns Formatted prompt for batch extraction
 */
export function buildBatchExtractionPrompt(
  videos: Array<{ video: VideoDetails; transcript: string }>,
  destination: string
): string {
  const videoSections = videos
    .map(({ video, transcript }, index) => {
      // Truncate each transcript to fit multiple in prompt
      const maxLen = Math.floor(4000 / videos.length);
      const truncated =
        transcript.length > maxLen
          ? transcript.substring(0, maxLen) + '...'
          : transcript;

      return `--- VIDEO ${index + 1}: ${video.title} (by ${video.channelTitle}) ---
${truncated}`;
    })
    .join('\n\n');

  return `Extract travel recommendations from these video transcripts about ${destination}.

${videoSections}

---

For each video, extract all specific, named recommendations. Group by video.

Return as JSON:
{
  "videos": [
    {
      "videoId": "video_id",
      "recommendations": [
        {
          "name": "Place Name",
          "type": "food|place|activity|neighborhood|daytrip|experience",
          "description": "Brief description",
          "location": "Specific area or null",
          "timestampSeconds": 120
        }
      ]
    }
  ]
}

Only include items with specific names. Skip generic references.`;
}

// ============================================================================
// Response Parsing Types
// ============================================================================

/**
 * Expected structure of LLM extraction response for single video
 */
export interface ExtractedRecommendation {
  /** Name of the place/activity */
  name: string;
  /** Type of recommendation */
  type: 'food' | 'place' | 'activity' | 'neighborhood' | 'daytrip' | 'experience';
  /** Brief description */
  description: string;
  /** Specific location if available */
  location?: string | null;
  /** Approximate timestamp in seconds */
  timestampSeconds?: number;
}

/**
 * Expected structure for batch extraction response
 */
export interface BatchExtractionResponse {
  videos: Array<{
    videoId: string;
    recommendations: ExtractedRecommendation[];
  }>;
}

// ============================================================================
// Prompt Version
// ============================================================================

/**
 * Version identifier for the extraction prompt.
 * Used for reproducibility and debugging.
 */
export const YOUTUBE_EXTRACTION_PROMPT_VERSION = 'v1.0.0';
