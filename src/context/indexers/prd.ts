/**
 * PRD Indexing Module
 *
 * Parses PRD markdown documents and prepares sections for vector storage.
 * Handles section extraction, hash-based change detection, and reindexing.
 *
 * @module context/indexers/prd
 * @see PRD Section 0.4 - Data Collections
 */

import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import type { PrdSection } from '../types.js';

/**
 * Parsed PRD section without embedding (to be added during storage)
 */
export type ParsedPrdSection = Omit<PrdSection, 'embedding'>;

/**
 * Result of indexing operation
 */
export interface IndexResult {
  indexed: number;
  errors: string[];
}

/**
 * Hash metadata stored for change detection
 */
interface PrdHashMetadata {
  fileHash: string;
  indexedAt: string;
  sectionCount: number;
}

// In-memory cache for file hash (would be persisted in production)
let cachedHashMetadata: PrdHashMetadata | null = null;

/**
 * Generates SHA-256 hash of content for change detection
 *
 * @param content - Content to hash
 * @returns Hex-encoded hash string
 */
export function getFileHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Extracts section number from header text
 *
 * Handles formats like:
 * - "## 0. Development Infrastructure"  -> 0
 * - "## 12. Data Model"                 -> 12
 * - "## Appendix A: Types"              -> -1 (appendix)
 * - "## Summary"                        -> -1 (no number)
 *
 * @param header - Section header text
 * @returns Section number or -1 if none found
 */
export function extractSectionNumber(header: string): number {
  // Match patterns like "0.", "1.", "12.", etc. at start of header
  const match = header.match(/^(\d+)\.\s/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return -1;
}

/**
 * Extracts title from header text (without the number prefix)
 *
 * @param header - Section header text (without ## prefix)
 * @returns Clean title text
 */
export function extractTitle(header: string): string {
  // Remove leading number and period if present
  return header.trim().replace(/^\d+\.\s*/, '').trim();
}

/**
 * Generates stable section ID
 *
 * @param sectionNumber - Section number (-1 for unnumbered)
 * @param title - Section title
 * @returns Stable ID string
 */
export function generateSectionId(sectionNumber: number, title: string): string {
  if (sectionNumber >= 0) {
    return `prd-section-${sectionNumber}`;
  }
  // For unnumbered sections, use slugified title
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
  return `prd-section-${slug}`;
}

/**
 * Parses PRD markdown content into discrete sections
 *
 * Splits on `## ` (H2 headers) to extract sections.
 * - Section 0 is content before first ## header (if any)
 * - Preserves full content under each header until next ## header
 * - Extracts section numbers from headers like "## 12. Data Model"
 *
 * @param prdContent - Full PRD markdown content
 * @returns Array of parsed sections without embeddings
 */
export function parsePrdSections(prdContent: string): ParsedPrdSection[] {
  const sections: ParsedPrdSection[] = [];

  if (!prdContent || prdContent.trim().length === 0) {
    return sections;
  }

  // Split on H2 headers (## )
  // Using regex that captures the header for splitting
  const parts = prdContent.split(/^## /gm);

  let sectionIndex = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (i === 0) {
      // Content before first ## header (preamble)
      const preamble = part.trim();
      if (preamble.length > 0) {
        sections.push({
          id: 'prd-section-preamble',
          sectionNumber: -1,
          title: 'Preamble',
          content: preamble,
        });
        sectionIndex++;
      }
      continue;
    }

    // For all other parts, the content starts with the header text
    // (we split on "## " so part begins with header content)
    const lines = part.split('\n');
    const headerLine = lines[0].trim();
    const content = lines.slice(1).join('\n').trim();

    // Skip empty sections
    if (headerLine.length === 0 && content.length === 0) {
      continue;
    }

    const sectionNumber = extractSectionNumber(headerLine);
    const title = extractTitle(headerLine);
    const id = generateSectionId(sectionNumber, title);

    // Include header in content for context
    const fullContent = `## ${headerLine}\n\n${content}`;

    sections.push({
      id,
      sectionNumber,
      title,
      content: fullContent,
    });

    sectionIndex++;
  }

  return sections;
}

/**
 * Checks if PRD has changed and needs reindexing
 *
 * Compares current file hash against cached hash from last indexing.
 *
 * @param prdPath - Path to PRD file
 * @returns True if reindexing is needed
 */
export async function needsReindex(prdPath: string): Promise<boolean> {
  try {
    const content = await readFile(prdPath, 'utf-8');
    const currentHash = getFileHash(content);

    if (!cachedHashMetadata) {
      // No previous index, needs indexing
      return true;
    }

    return cachedHashMetadata.fileHash !== currentHash;
  } catch (error) {
    // File doesn't exist or can't be read - needs indexing attempt
    return true;
  }
}

/**
 * Gets the cached hash metadata for testing/debugging
 *
 * @returns Cached metadata or null
 */
export function getCachedHashMetadata(): PrdHashMetadata | null {
  return cachedHashMetadata;
}

/**
 * Clears the cached hash metadata (for testing)
 */
export function clearCachedHashMetadata(): void {
  cachedHashMetadata = null;
}

/**
 * Sets the cached hash metadata (for testing or external persistence)
 *
 * @param metadata - Hash metadata to cache
 */
export function setCachedHashMetadata(metadata: PrdHashMetadata): void {
  cachedHashMetadata = metadata;
}

/**
 * Indexes all sections of a PRD file
 *
 * Reads the PRD, parses sections, and stores each section with embeddings.
 * Updates the cached hash for change detection.
 *
 * @param prdPath - Path to PRD file
 * @param storeFn - Optional storage function (for dependency injection in tests)
 * @returns Index result with count and any errors
 */
export async function indexPrd(
  prdPath: string,
  storeFn?: (section: PrdSection) => Promise<void>
): Promise<IndexResult> {
  const errors: string[] = [];
  let indexed = 0;

  try {
    const content = await readFile(prdPath, 'utf-8');
    const sections = parsePrdSections(content);

    for (const section of sections) {
      try {
        if (storeFn) {
          // Convert ParsedPrdSection to PrdSection (embedding will be added by storage)
          await storeFn(section as PrdSection);
        }
        indexed++;
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : 'Unknown error';
        errors.push(`Failed to index section "${section.title}": ${errorMsg}`);
      }
    }

    // Update cached hash on successful indexing
    cachedHashMetadata = {
      fileHash: getFileHash(content),
      indexedAt: new Date().toISOString(),
      sectionCount: indexed,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    errors.push(`Failed to read PRD file: ${errorMsg}`);
  }

  return { indexed, errors };
}

/**
 * Reindexes PRD if content has changed
 *
 * Checks file hash against cached hash and only reindexes if different.
 *
 * @param prdPath - Path to PRD file
 * @param storeFn - Optional storage function
 * @returns Index result (may have 0 indexed if no changes)
 */
export async function reindexPrd(
  prdPath: string,
  storeFn?: (section: PrdSection) => Promise<void>
): Promise<IndexResult> {
  const needsUpdate = await needsReindex(prdPath);

  if (!needsUpdate) {
    return {
      indexed: 0,
      errors: [],
    };
  }

  return indexPrd(prdPath, storeFn);
}
