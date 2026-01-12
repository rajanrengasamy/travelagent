/**
 * Perplexity Response Parser
 *
 * Parses Perplexity API responses into Candidate objects for the pipeline.
 * Extracts discrete recommendations from narrative text and maps citations
 * to SourceRefs.
 *
 * @see PRD Section FR3.1 - Perplexity Worker
 * @see Task 9.2 - Response Parsing
 * @module workers/perplexity/parser
 */

import { createHash } from 'crypto';
import type {
  Candidate,
  CandidateType,
  CandidateConfidence,
  SourceRef,
} from '../../schemas/candidate.js';

// Import client types for consistency
import type { ChatResponse, Citation } from './client.js';

// Re-export types for backwards compatibility
export type { ChatResponse, Citation };

/**
 * Extracted recommendation from Perplexity response text
 */
interface ExtractedRecommendation {
  /** Name/title of the recommendation */
  name: string;
  /** Description text */
  description: string;
  /** Detected type of recommendation */
  type: CandidateType;
  /** Location text if mentioned */
  locationText?: string;
  /** Citation indices referenced (e.g., [1], [2]) */
  citationIndices: number[];
}

// ============================================================================
// Main Parser Function
// ============================================================================

/**
 * Parse a Perplexity API response into Candidate objects.
 *
 * The parser:
 * 1. Extracts discrete recommendations from the narrative text
 * 2. Maps citation numbers to the citations array
 * 3. Creates properly structured Candidate objects
 *
 * @param response - The Perplexity API response
 * @param destination - The destination for location context
 * @returns Array of Candidate objects
 */
export function parsePerplexityResponse(
  response: ChatResponse,
  destination: string
): Candidate[] {
  const { content, citations = [] } = response;

  // Extract recommendations from the response text
  const recommendations = extractRecommendations(content);

  // Convert recommendations to Candidates
  const candidates: Candidate[] = [];
  const now = new Date().toISOString();

  for (const rec of recommendations) {
    // Map citation indices to SourceRefs
    const sourceRefs = mapCitationsToSourceRefs(rec.citationIndices, citations, now);

    // Determine confidence based on source availability
    const confidence = determineConfidence(sourceRefs);

    // Generate stable candidate ID
    const candidateId = generateCandidateId(rec.name, destination);

    // Build the candidate object
    const candidate: Candidate = {
      candidateId,
      type: rec.type,
      title: rec.name,
      summary: rec.description,
      locationText: rec.locationText || destination,
      tags: inferTags(rec.type, rec.description),
      origin: 'web',
      sourceRefs,
      confidence,
      score: 50, // Default mid-range score, will be adjusted by ranking stage
      // metadata omitted for Perplexity - no platform-specific data available
      // origin: 'web' already indicates this came from web knowledge worker
    };

    candidates.push(candidate);
  }

  return candidates;
}

// ============================================================================
// Extraction Functions
// ============================================================================

/**
 * Extract discrete recommendations from Perplexity response text.
 *
 * Handles multiple formats:
 * - Numbered lists (1. Item Name - Description)
 * - Bulleted lists (- Item Name: Description)
 * - Bold headers (**Item Name**)
 * - Section headers (### Item Name)
 *
 * @param text - The raw response text
 * @returns Array of extracted recommendations
 */
export function extractRecommendations(text: string): ExtractedRecommendation[] {
  const recommendations: ExtractedRecommendation[] = [];
  const seen = new Set<string>();

  // Pattern 1: Numbered list items with bold names
  // Matches: "1. **Name** - Description [1][2]"
  const numberedBoldPattern = /^\s*\d+\.\s*\*\*([^*]+)\*\*\s*[-:–]\s*(.+?)$/gm;

  // Pattern 2: Numbered list items without bold
  // Matches: "1. Name - Description" or "1. Name: Description"
  const numberedPlainPattern = /^\s*\d+\.\s*([^-:–\n]+?)\s*[-:–]\s*(.+?)$/gm;

  // Pattern 3: Bulleted list items
  // Matches: "- **Name**: Description" or "- Name - Description"
  const bulletPattern = /^\s*[-*]\s*\*?\*?([^*\n:–-]+?)\*?\*?\s*[-:–]\s*(.+?)$/gm;

  // Pattern 4: Section headers followed by description
  // Matches: "### Name" followed by description paragraph
  const sectionPattern = /^#{2,4}\s*(.+?)$\n+([^#\n].+?)(?=\n\n|\n#|$)/gm;

  // Try each pattern
  const patterns = [
    { regex: numberedBoldPattern, priority: 1 },
    { regex: numberedPlainPattern, priority: 2 },
    { regex: bulletPattern, priority: 3 },
    { regex: sectionPattern, priority: 4 },
  ];

  for (const { regex } of patterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const name = cleanName(match[1]);
      const description = match[2].trim();

      // Skip duplicates and too-short names
      const normalizedName = name.toLowerCase();
      if (seen.has(normalizedName) || name.length < 3) {
        continue;
      }
      seen.add(normalizedName);

      // Extract citation indices from the description
      const citationIndices = extractCitationIndices(description);

      // Determine the type from context
      const type = inferTypeFromContent(name, description);

      // Extract location if mentioned
      const locationText = extractLocationFromDescription(description);

      recommendations.push({
        name,
        description: cleanDescription(description),
        type,
        locationText,
        citationIndices,
      });
    }
    // Reset regex lastIndex for next pattern
    regex.lastIndex = 0;
  }

  // If no structured recommendations found, try to extract from narrative
  if (recommendations.length === 0) {
    const narrativeRecs = extractFromNarrative(text);
    recommendations.push(...narrativeRecs);
  }

  return recommendations;
}

/**
 * Extract recommendations from narrative/paragraph text.
 *
 * Falls back to finding named entities (places in quotes or bold)
 * when structured lists are not present.
 *
 * @param text - The narrative text
 * @returns Array of extracted recommendations
 */
function extractFromNarrative(text: string): ExtractedRecommendation[] {
  const recommendations: ExtractedRecommendation[] = [];
  const seen = new Set<string>();

  // Look for quoted or bolded place names followed by context
  // Matches: "Place Name" or **Place Name** with surrounding text
  const namedEntityPattern = /(?:[""]([^""]+)["""]|\*\*([^*]+)\*\*)\s*(?:is|,|[-–])\s*([^.]+\.)/g;

  let match;
  while ((match = namedEntityPattern.exec(text)) !== null) {
    const name = cleanName(match[1] || match[2]);
    const description = match[3].trim();

    const normalizedName = name.toLowerCase();
    if (seen.has(normalizedName) || name.length < 3) {
      continue;
    }
    seen.add(normalizedName);

    const citationIndices = extractCitationIndices(description);
    const type = inferTypeFromContent(name, description);

    recommendations.push({
      name,
      description: cleanDescription(description),
      type,
      citationIndices,
    });
  }

  return recommendations;
}

/**
 * Extract citation indices (e.g., [1], [2]) from text.
 *
 * @param text - Text containing citation markers
 * @returns Array of citation indices (1-based as returned by Perplexity)
 */
export function extractCitationIndices(text: string): number[] {
  const indices: number[] = [];
  const citationPattern = /\[(\d+)\]/g;

  let match;
  while ((match = citationPattern.exec(text)) !== null) {
    const idx = parseInt(match[1], 10);
    if (!indices.includes(idx)) {
      indices.push(idx);
    }
  }

  return indices.sort((a, b) => a - b);
}

// ============================================================================
// Mapping Functions
// ============================================================================

/**
 * Map citation indices to SourceRef objects.
 *
 * @param indices - Citation indices from the text (1-based)
 * @param citations - Citations array from the API response
 * @param retrievedAt - Timestamp for the sourceRef
 * @returns Array of SourceRef objects
 */
export function mapCitationsToSourceRefs(
  indices: number[],
  citations: Citation[],
  retrievedAt: string
): SourceRef[] {
  const sourceRefs: SourceRef[] = [];

  for (const idx of indices) {
    // Convert 1-based index to 0-based array index
    const citation = citations[idx - 1];
    if (citation) {
      sourceRefs.push(citationToSourceRef(citation, retrievedAt));
    }
  }

  return sourceRefs;
}

/**
 * Convert a Perplexity Citation to a SourceRef.
 *
 * @param citation - The citation from Perplexity
 * @param retrievedAt - Timestamp for when the source was retrieved
 * @returns SourceRef object
 */
export function citationToSourceRef(citation: Citation, retrievedAt: string): SourceRef {
  return {
    url: citation.url,
    publisher: extractPublisher(citation.url),
    retrievedAt,
    snippet: citation.snippet,
  };
}

/**
 * Extract publisher/domain name from URL.
 *
 * @param url - The source URL
 * @returns Publisher name or undefined if parsing fails
 */
export function extractPublisher(url: string): string | undefined {
  try {
    const hostname = new URL(url).hostname;
    // Remove www. prefix and return domain
    return hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generate a stable candidate ID from title and location.
 *
 * Uses SHA-256 hash truncated to 16 characters for a stable,
 * deterministic identifier that can be used for deduplication.
 *
 * @param title - The candidate title/name
 * @param location - The location context
 * @returns 16-character hex string ID
 */
export function generateCandidateId(title: string, location: string): string {
  const seed = `${title.toLowerCase().trim()}|${location.toLowerCase().trim()}`;
  return createHash('sha256').update(seed).digest('hex').slice(0, 16);
}

// ============================================================================
// Classification Functions
// ============================================================================

/**
 * Infer the candidate type from name and description.
 *
 * @param name - The candidate name
 * @param description - The candidate description
 * @returns The inferred CandidateType
 */
export function inferTypeFromContent(name: string, description: string): CandidateType {
  const combined = `${name} ${description}`.toLowerCase();

  // Food-related keywords
  const foodKeywords = [
    'restaurant', 'cafe', 'bakery', 'bistro', 'trattoria', 'osteria',
    'pizzeria', 'cuisine', 'dining', 'food', 'eat', 'meal', 'lunch',
    'dinner', 'breakfast', 'brunch', 'tapas', 'sushi', 'ramen',
    'gelato', 'pastry', 'coffee', 'wine bar', 'pub', 'bar',
  ];
  if (foodKeywords.some((kw) => combined.includes(kw))) {
    return 'food';
  }

  // Activity keywords
  const activityKeywords = [
    'tour', 'hike', 'hiking', 'trek', 'trekking', 'bike', 'cycling',
    'kayak', 'snorkel', 'dive', 'diving', 'surf', 'surfing', 'ski',
    'skiing', 'climb', 'climbing', 'sail', 'sailing', 'class', 'lesson',
    'workshop', 'cooking class', 'wine tasting', 'excursion',
  ];
  if (activityKeywords.some((kw) => combined.includes(kw))) {
    return 'activity';
  }

  // Neighborhood keywords
  const neighborhoodKeywords = [
    'neighborhood', 'neighbourhood', 'district', 'quarter', 'area',
    'borough', 'arrondissement', 'barrio', 'quartier',
  ];
  if (neighborhoodKeywords.some((kw) => combined.includes(kw))) {
    return 'neighborhood';
  }

  // Day trip keywords
  const daytripKeywords = [
    'day trip', 'daytrip', 'excursion', 'nearby', 'outside the city',
    'side trip', 'half day', 'full day', 'drive from', 'train from',
  ];
  if (daytripKeywords.some((kw) => combined.includes(kw))) {
    return 'daytrip';
  }

  // Experience keywords (broader than activity)
  const experienceKeywords = [
    'experience', 'festival', 'event', 'show', 'performance', 'concert',
    'market', 'bazaar', 'night life', 'nightlife', 'sunset', 'sunrise',
  ];
  if (experienceKeywords.some((kw) => combined.includes(kw))) {
    return 'experience';
  }

  // Default to 'place' for general attractions
  return 'place';
}

/**
 * Determine confidence level based on source availability.
 *
 * @param sourceRefs - The source references for this candidate
 * @returns CandidateConfidence level
 */
export function determineConfidence(sourceRefs: SourceRef[]): CandidateConfidence {
  if (sourceRefs.length === 0) {
    return 'needs_verification';
  }
  if (sourceRefs.length === 1) {
    return 'provisional';
  }
  // Multiple sources provide higher confidence
  return 'verified';
}

/**
 * Infer tags from type and description.
 *
 * @param type - The candidate type
 * @param description - The candidate description
 * @returns Array of inferred tags
 */
function inferTags(type: CandidateType, description: string): string[] {
  const tags: string[] = [type];
  const lowerDesc = description.toLowerCase();

  // Add relevant tags based on content
  const tagMappings: Record<string, string[]> = {
    'historic': ['history', 'historic'],
    'museum': ['museum', 'culture'],
    'art': ['art', 'culture'],
    'beach': ['beach', 'nature'],
    'park': ['park', 'nature', 'outdoors'],
    'garden': ['garden', 'nature'],
    'mountain': ['mountain', 'nature', 'outdoors'],
    'local': ['local', 'authentic'],
    'traditional': ['traditional', 'authentic'],
    'hidden gem': ['hidden-gem', 'off-the-beaten-path'],
    'romantic': ['romantic', 'couples'],
    'family': ['family-friendly'],
    'kid': ['family-friendly'],
    'budget': ['budget-friendly'],
    'luxury': ['luxury', 'upscale'],
    'view': ['scenic', 'views'],
    'instagram': ['photogenic', 'instagram'],
    'photo': ['photogenic'],
  };

  for (const [keyword, tagList] of Object.entries(tagMappings)) {
    if (lowerDesc.includes(keyword)) {
      for (const tag of tagList) {
        if (!tags.includes(tag)) {
          tags.push(tag);
        }
      }
    }
  }

  return tags;
}

// ============================================================================
// Text Cleaning Utilities
// ============================================================================

/**
 * Clean a name by removing markdown formatting and extra whitespace.
 *
 * @param name - Raw name string
 * @returns Cleaned name
 */
function cleanName(name: string): string {
  return name
    .replace(/\*\*/g, '') // Remove bold markers
    .replace(/\*/g, '')   // Remove italic markers
    .replace(/\[.*?\]/g, '') // Remove citation markers
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Clean a description by removing citation markers and extra whitespace.
 *
 * @param description - Raw description string
 * @returns Cleaned description
 */
function cleanDescription(description: string): string {
  return description
    .replace(/\[\d+\]/g, '') // Remove citation markers
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Extract location text from description if explicitly mentioned.
 *
 * @param description - The description text
 * @returns Location string or undefined
 */
function extractLocationFromDescription(description: string): string | undefined {
  // Look for "located in X", "in the X district", "in X neighborhood"
  const locationPatterns = [
    /located (?:in|at|on) ([^,.\n]+)/i,
    /in the ([^,.\n]+ (?:district|neighborhood|area|quarter))/i,
    /found (?:in|at) ([^,.\n]+)/i,
  ];

  for (const pattern of locationPatterns) {
    const match = description.match(pattern);
    if (match) {
      return cleanName(match[1]);
    }
  }

  return undefined;
}
