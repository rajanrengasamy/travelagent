/**
 * Results Export Utilities
 *
 * Export functions for writing discovery results to JSON and Markdown formats.
 * Uses atomic write pattern for data integrity.
 *
 * @module stages/results/export
 * @see PRD Section 18.0 - Results Stage (Stage 10)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { DiscoveryResults } from '../../schemas/discovery-results.js';
import type { NarrativeOutput, Highlight, Recommendation } from '../../aggregator/types.js';
import type { Candidate } from '../../schemas/candidate.js';

// ============================================================================
// Constants
// ============================================================================

/** JSON indentation for pretty printing */
const JSON_INDENT = 2;

/** Separator for markdown sections */
const MD_SECTION_SEPARATOR = '\n---\n\n';

// ============================================================================
// JSON Export
// ============================================================================

/**
 * Export DiscoveryResults to a JSON file.
 *
 * Uses atomic write pattern (temp file + rename) to prevent corruption.
 * Creates parent directory if it doesn't exist.
 *
 * @param results - The discovery results to export
 * @param outputPath - Target file path for results.json
 *
 * @example
 * ```typescript
 * await exportResultsJson(results, '/path/to/exports/10_results.json');
 * ```
 */
export async function exportResultsJson(
  results: DiscoveryResults,
  outputPath: string
): Promise<void> {
  // Ensure parent directory exists
  const dir = path.dirname(outputPath);
  await fs.mkdir(dir, { recursive: true });

  // Prepare JSON content with pretty printing
  const json = JSON.stringify(results, null, JSON_INDENT);

  // Atomic write: temp file + rename
  const tempPath = `${outputPath}.tmp.${Date.now()}`;

  try {
    await fs.writeFile(tempPath, json, 'utf-8');
    await fs.rename(tempPath, outputPath);
  } catch (error) {
    // Clean up temp file on failure
    try {
      await fs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to export results JSON to ${outputPath}: ${message}`, {
      cause: error,
    });
  }
}

// ============================================================================
// Markdown Export
// ============================================================================

/**
 * Export DiscoveryResults to a Markdown report file.
 *
 * Generates a human-readable report with narrative summary, candidates,
 * highlights, and recommendations. Uses atomic write pattern.
 *
 * @param results - The discovery results to export
 * @param narrative - Optional narrative output from aggregator (null for degraded mode)
 * @param outputPath - Target file path for results.md
 *
 * @example
 * ```typescript
 * await exportResultsMd(results, narrative, '/path/to/exports/results.md');
 * ```
 */
export async function exportResultsMd(
  results: DiscoveryResults,
  narrative: NarrativeOutput | null,
  outputPath: string
): Promise<void> {
  // Ensure parent directory exists
  const dir = path.dirname(outputPath);
  await fs.mkdir(dir, { recursive: true });

  // Generate markdown content
  const markdown = generateMarkdownReport(results, narrative);

  // Atomic write: temp file + rename
  const tempPath = `${outputPath}.tmp.${Date.now()}`;

  try {
    await fs.writeFile(tempPath, markdown, 'utf-8');
    await fs.rename(tempPath, outputPath);
  } catch (error) {
    // Clean up temp file on failure
    try {
      await fs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to export results Markdown to ${outputPath}: ${message}`, {
      cause: error,
    });
  }
}

// ============================================================================
// Markdown Generation (Pure Function)
// ============================================================================

/**
 * Generate a Markdown report from discovery results.
 *
 * Pure function that produces the markdown content without side effects.
 * Handles null narrative gracefully by showing raw candidate list.
 *
 * @param results - The discovery results
 * @param narrative - Optional narrative output (null for degraded mode)
 * @returns Formatted markdown string
 *
 * @example
 * ```typescript
 * const markdown = generateMarkdownReport(results, narrative);
 * console.log(markdown);
 * ```
 */
export function generateMarkdownReport(
  results: DiscoveryResults,
  narrative: NarrativeOutput | null
): string {
  const sections: string[] = [];

  // Header with session/run info
  sections.push(formatHeader(results));

  // Summary section
  sections.push(formatSummary(results, narrative));

  // Top candidates
  sections.push(formatCandidates(results.candidates));

  // Highlights (from narrative)
  if (narrative?.highlights && narrative.highlights.length > 0) {
    sections.push(formatHighlights(narrative.highlights));
  }

  // Recommendations (from narrative)
  if (narrative?.recommendations && narrative.recommendations.length > 0) {
    sections.push(formatRecommendations(narrative.recommendations));
  }

  // Statistics footer
  sections.push(formatStatistics(results));

  return sections.join(MD_SECTION_SEPARATOR);
}

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Format the report header with session and run information.
 */
function formatHeader(results: DiscoveryResults): string {
  const timestamp = new Date(results.createdAt).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  return `# Travel Discovery Results

**Session**: ${results.sessionId}
**Run**: ${results.runId}
**Generated**: ${timestamp}`;
}

/**
 * Format the summary section with narrative introduction or degraded mode notice.
 */
function formatSummary(
  results: DiscoveryResults,
  narrative: NarrativeOutput | null
): string {
  const lines: string[] = ['## Summary'];

  if (narrative) {
    // Full narrative mode
    lines.push('');
    lines.push(narrative.introduction);

    // Include narrative sections if present
    if (narrative.sections && narrative.sections.length > 0) {
      for (const section of narrative.sections) {
        lines.push('');
        lines.push(`### ${section.heading}`);
        lines.push('');
        lines.push(section.content);
      }
    }

    // Include conclusion if present
    if (narrative.conclusion) {
      lines.push('');
      lines.push(narrative.conclusion);
    }
  } else {
    // Degraded mode notice
    lines.push('');
    lines.push('> **Note**: Running in degraded mode. Narrative generation was unavailable.');
    lines.push('> The following candidates are presented in ranked order without narrative context.');
    lines.push('');
    lines.push(`Found **${results.candidates.length}** travel recommendations.`);
  }

  return lines.join('\n');
}

/**
 * Format the candidates list with key details.
 */
function formatCandidates(candidates: Candidate[]): string {
  const lines: string[] = ['## Top Picks'];

  if (candidates.length === 0) {
    lines.push('');
    lines.push('*No candidates found for this search.*');
    return lines.join('\n');
  }

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    lines.push('');
    lines.push(formatCandidate(candidate, i + 1));
  }

  return lines.join('\n');
}

/**
 * Format a single candidate entry.
 */
function formatCandidate(candidate: Candidate, rank: number): string {
  const lines: string[] = [];

  // Title with rank
  lines.push(`### ${rank}. ${candidate.title}`);
  lines.push('');

  // Summary/description
  lines.push(candidate.summary);
  lines.push('');

  // Metadata line
  const metadata: string[] = [];

  // Location
  if (candidate.locationText) {
    metadata.push(`Location: ${candidate.locationText}`);
  }

  // Price level (convert 0-4 to $ symbols)
  if (candidate.metadata?.priceLevel !== undefined) {
    const priceSymbols = '$'.repeat(candidate.metadata.priceLevel + 1);
    metadata.push(`Price: ${priceSymbols}`);
  }

  // Rating
  if (candidate.metadata?.rating !== undefined) {
    const rating = candidate.metadata.rating.toFixed(1);
    metadata.push(`Rating: ${rating}/5`);
  }

  // Type
  metadata.push(`Type: ${candidate.type}`);

  if (metadata.length > 0) {
    lines.push(`*${metadata.join(' | ')}*`);
    lines.push('');
  }

  // Tags
  if (candidate.tags && candidate.tags.length > 0) {
    const tagList = candidate.tags.map((t) => `\`${t}\``).join(' ');
    lines.push(`Tags: ${tagList}`);
    lines.push('');
  }

  // Validation status (if not default)
  if (candidate.validation && candidate.validation.status !== 'unverified') {
    const statusEmoji = getValidationEmoji(candidate.validation.status);
    lines.push(`${statusEmoji} ${formatValidationStatus(candidate.validation.status)}`);
    if (candidate.validation.notes) {
      lines.push(`   *${candidate.validation.notes}*`);
    }
    lines.push('');
  }

  // Source references
  if (candidate.sourceRefs && candidate.sourceRefs.length > 0) {
    const sources = candidate.sourceRefs
      .slice(0, 3) // Limit to 3 sources
      .map((ref) => {
        let publisher = ref.publisher;
        if (!publisher) {
          try {
            publisher = new URL(ref.url).hostname;
          } catch {
            publisher = 'Unknown';
          }
        }
        return `[${publisher}](${ref.url})`;
      });
    lines.push(`Sources: ${sources.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Get emoji indicator for validation status.
 */
function getValidationEmoji(status: string): string {
  switch (status) {
    case 'verified':
      return '[Verified]';
    case 'partially_verified':
      return '[Partially Verified]';
    case 'conflict_detected':
      return '[Conflict]';
    case 'not_applicable':
      return '[N/A]';
    default:
      return '';
  }
}

/**
 * Format validation status for display.
 */
function formatValidationStatus(status: string): string {
  switch (status) {
    case 'verified':
      return 'Verified across multiple sources';
    case 'partially_verified':
      return 'Partially verified';
    case 'conflict_detected':
      return 'Conflicting information detected';
    case 'not_applicable':
      return 'Validation not applicable';
    default:
      return status;
  }
}

/**
 * Format the highlights section.
 */
function formatHighlights(highlights: Highlight[]): string {
  const lines: string[] = ['## Highlights'];

  for (const highlight of highlights) {
    lines.push('');
    lines.push(`**${highlight.title}** (${formatHighlightType(highlight.type)})`);
    if (highlight.description) {
      lines.push(`${highlight.description}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format highlight type for display.
 */
function formatHighlightType(type: string): string {
  switch (type) {
    case 'must_see':
      return 'Must See';
    case 'local_favorite':
      return 'Local Favorite';
    case 'unique_experience':
      return 'Unique Experience';
    case 'budget_friendly':
      return 'Budget Friendly';
    case 'luxury':
      return 'Luxury';
    default:
      return type;
  }
}

/**
 * Format the recommendations section.
 */
function formatRecommendations(recommendations: Recommendation[]): string {
  const lines: string[] = ['## Recommendations'];

  // Sort by priority (high first)
  const sorted = [...recommendations].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority];
  });

  for (const rec of sorted) {
    lines.push('');
    const priorityBadge = rec.priority === 'high' ? '**[High Priority]**' : '';
    lines.push(`- ${priorityBadge} ${rec.text}`);
    if (rec.reasoning) {
      lines.push(`  *${rec.reasoning}*`);
    }
  }

  return lines.join('\n');
}

/**
 * Format the statistics footer.
 */
function formatStatistics(results: DiscoveryResults): string {
  const lines: string[] = ['## Statistics'];
  lines.push('');

  // Timing
  const durationSec = (results.durationMs / 1000).toFixed(1);
  lines.push(`- **Total Duration**: ${durationSec}s`);
  lines.push(`- **Candidates Found**: ${results.candidates.length}`);

  // Worker summary
  if (results.workerSummary && results.workerSummary.length > 0) {
    lines.push('');
    lines.push('### Worker Summary');
    lines.push('');
    lines.push('| Worker | Status | Candidates | Duration |');
    lines.push('|--------|--------|------------|----------|');

    for (const worker of results.workerSummary) {
      const statusIcon = worker.status === 'ok' ? 'OK' : worker.status.toUpperCase();
      const duration = `${(worker.durationMs / 1000).toFixed(1)}s`;
      lines.push(`| ${worker.workerId} | ${statusIcon} | ${worker.candidateCount} | ${duration} |`);
    }
  }

  // Degradation info
  if (results.degradation.level !== 'none') {
    lines.push('');
    lines.push('### Degradation');
    lines.push(`- **Level**: ${results.degradation.level}`);

    if (results.degradation.failedWorkers.length > 0) {
      lines.push(`- **Failed Workers**: ${results.degradation.failedWorkers.join(', ')}`);
    }

    if (results.degradation.warnings.length > 0) {
      lines.push('- **Warnings**:');
      for (const warning of results.degradation.warnings) {
        lines.push(`  - ${warning}`);
      }
    }
  }

  // Schema version
  lines.push('');
  lines.push(`*Schema Version: ${results.schemaVersion}*`);

  return lines.join('\n');
}
