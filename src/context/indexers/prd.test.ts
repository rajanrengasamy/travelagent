/**
 * PRD Indexer Tests
 *
 * Tests for PRD parsing, section extraction, and indexing functionality.
 * Uses jest.unstable_mockModule for proper ESM mocking of fs/promises.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Create mock readFile function before any imports
const mockReadFile = jest.fn<(path: string, encoding: string) => Promise<string>>();

// Mock fs/promises with ESM-compatible pattern
jest.unstable_mockModule('fs/promises', () => ({
  readFile: mockReadFile,
  __esModule: true,
}));

// Import the module under test AFTER setting up mocks
const {
  parsePrdSections,
  extractSectionNumber,
  extractTitle,
  generateSectionId,
  getFileHash,
  needsReindex,
  indexPrd,
  reindexPrd,
  clearCachedHashMetadata,
  setCachedHashMetadata,
  getCachedHashMetadata,
} = await import('./prd.js');

describe('PRD Indexer', () => {
  beforeEach(() => {
    clearCachedHashMetadata();
    jest.clearAllMocks();
    mockReadFile.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('extractSectionNumber', () => {
    it('should extract numbered sections', () => {
      expect(extractSectionNumber('0. Development Infrastructure')).toBe(0);
      expect(extractSectionNumber('1. Executive Summary')).toBe(1);
      expect(extractSectionNumber('12. Data Model')).toBe(12);
      expect(extractSectionNumber('25. Appendix B')).toBe(25);
    });

    it('should return -1 for unnumbered sections', () => {
      expect(extractSectionNumber('Appendix A: Types')).toBe(-1);
      expect(extractSectionNumber('Summary')).toBe(-1);
      expect(extractSectionNumber('Table of Contents')).toBe(-1);
    });

    it('should handle edge cases', () => {
      expect(extractSectionNumber('')).toBe(-1);
      expect(extractSectionNumber('No number here')).toBe(-1);
      expect(extractSectionNumber('100. Large number')).toBe(100);
    });
  });

  describe('extractTitle', () => {
    it('should extract title without number prefix', () => {
      expect(extractTitle('0. Development Infrastructure')).toBe('Development Infrastructure');
      expect(extractTitle('12. Data Model')).toBe('Data Model');
    });

    it('should return full text for unnumbered headers', () => {
      expect(extractTitle('Appendix A: Types')).toBe('Appendix A: Types');
      expect(extractTitle('Summary')).toBe('Summary');
    });

    it('should trim whitespace', () => {
      expect(extractTitle('  1. Spaced Title  ')).toBe('Spaced Title');
    });
  });

  describe('generateSectionId', () => {
    it('should generate numbered section IDs', () => {
      expect(generateSectionId(0, 'Development')).toBe('prd-section-0');
      expect(generateSectionId(12, 'Data Model')).toBe('prd-section-12');
    });

    it('should generate slugified IDs for unnumbered sections', () => {
      expect(generateSectionId(-1, 'Appendix A: Types')).toBe('prd-section-appendix-a-types');
      expect(generateSectionId(-1, 'Summary')).toBe('prd-section-summary');
    });

    it('should truncate long slugs', () => {
      const longTitle = 'This is a very long section title that should be truncated';
      const id = generateSectionId(-1, longTitle);
      expect(id.length).toBeLessThanOrEqual(42); // prd-section- (12) + 30
    });
  });

  describe('getFileHash', () => {
    it('should return consistent hash for same content', () => {
      const content = 'Test content';
      const hash1 = getFileHash(content);
      const hash2 = getFileHash(content);
      expect(hash1).toBe(hash2);
    });

    it('should return different hash for different content', () => {
      const hash1 = getFileHash('Content A');
      const hash2 = getFileHash('Content B');
      expect(hash1).not.toBe(hash2);
    });

    it('should return valid hex string', () => {
      const hash = getFileHash('Test');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('parsePrdSections', () => {
    it('should parse PRD with multiple sections', () => {
      const prd = `# Title

Some preamble content.

## 0. Development Infrastructure

Content for section 0.

## 1. Executive Summary

Content for section 1.

## 12. Data Model

Content for section 12.
`;

      const sections = parsePrdSections(prd);

      expect(sections).toHaveLength(4); // preamble + 3 sections

      // Preamble
      expect(sections[0].id).toBe('prd-section-preamble');
      expect(sections[0].sectionNumber).toBe(-1);
      expect(sections[0].title).toBe('Preamble');

      // Section 0
      expect(sections[1].id).toBe('prd-section-0');
      expect(sections[1].sectionNumber).toBe(0);
      expect(sections[1].title).toBe('Development Infrastructure');
      expect(sections[1].content).toContain('Content for section 0');

      // Section 1
      expect(sections[2].id).toBe('prd-section-1');
      expect(sections[2].sectionNumber).toBe(1);
      expect(sections[2].title).toBe('Executive Summary');

      // Section 12
      expect(sections[3].id).toBe('prd-section-12');
      expect(sections[3].sectionNumber).toBe(12);
      expect(sections[3].title).toBe('Data Model');
    });

    it('should extract section numbers correctly', () => {
      const prd = `## 0. First
Content

## 25. Last
Content
`;
      const sections = parsePrdSections(prd);

      expect(sections[0].sectionNumber).toBe(0);
      expect(sections[1].sectionNumber).toBe(25);
    });

    it('should handle sections without numbers', () => {
      const prd = `## Appendix A: Types

Type definitions here.

## Summary

Summary content.
`;
      const sections = parsePrdSections(prd);

      expect(sections).toHaveLength(2);
      expect(sections[0].sectionNumber).toBe(-1);
      expect(sections[0].title).toBe('Appendix A: Types');
      expect(sections[1].sectionNumber).toBe(-1);
      expect(sections[1].title).toBe('Summary');
    });

    it('should handle empty PRD', () => {
      expect(parsePrdSections('')).toHaveLength(0);
      expect(parsePrdSections('   ')).toHaveLength(0);
    });

    it('should handle PRD with only preamble', () => {
      const prd = `# Title

Just some intro content without any sections.
`;
      const sections = parsePrdSections(prd);

      expect(sections).toHaveLength(1);
      expect(sections[0].id).toBe('prd-section-preamble');
    });

    it('should preserve H2 header in content', () => {
      const prd = `## 1. Test Section

Section content.
`;
      const sections = parsePrdSections(prd);

      expect(sections[0].content).toContain('## 1. Test Section');
      expect(sections[0].content).toContain('Section content');
    });

    it('should handle H3 subsections within sections', () => {
      const prd = `## 1. Main Section

### 1.1 Subsection

Subsection content.

### 1.2 Another Subsection

More content.
`;
      const sections = parsePrdSections(prd);

      expect(sections).toHaveLength(1);
      expect(sections[0].content).toContain('### 1.1 Subsection');
      expect(sections[0].content).toContain('### 1.2 Another Subsection');
    });
  });

  describe('needsReindex', () => {
    it('should return true when no cached hash exists', async () => {
      mockReadFile.mockResolvedValue('content');

      const result = await needsReindex('/path/to/prd.md');

      expect(result).toBe(true);
    });

    it('should return false when hash matches', async () => {
      const content = 'test content';
      mockReadFile.mockResolvedValue(content);

      setCachedHashMetadata({
        fileHash: getFileHash(content),
        indexedAt: new Date().toISOString(),
        sectionCount: 5,
      });

      const result = await needsReindex('/path/to/prd.md');

      expect(result).toBe(false);
    });

    it('should return true when hash differs', async () => {
      mockReadFile.mockResolvedValue('new content');

      setCachedHashMetadata({
        fileHash: getFileHash('old content'),
        indexedAt: new Date().toISOString(),
        sectionCount: 5,
      });

      const result = await needsReindex('/path/to/prd.md');

      expect(result).toBe(true);
    });

    it('should return true when file read fails', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      const result = await needsReindex('/nonexistent/path.md');

      expect(result).toBe(true);
    });
  });

  describe('indexPrd', () => {
    const samplePrd = `## 1. First Section

Content 1.

## 2. Second Section

Content 2.
`;

    it('should index all sections', async () => {
      mockReadFile.mockResolvedValue(samplePrd);

      const result = await indexPrd('/path/to/prd.md');

      expect(result.indexed).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should call store function for each section', async () => {
      mockReadFile.mockResolvedValue(samplePrd);
      const storeFn = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

      await indexPrd('/path/to/prd.md', storeFn);

      expect(storeFn).toHaveBeenCalledTimes(2);
    });

    it('should update cached hash metadata', async () => {
      mockReadFile.mockResolvedValue(samplePrd);

      await indexPrd('/path/to/prd.md');

      const metadata = getCachedHashMetadata();
      expect(metadata).not.toBeNull();
      expect(metadata?.fileHash).toBe(getFileHash(samplePrd));
      expect(metadata?.sectionCount).toBe(2);
    });

    it('should report errors for failed section storage', async () => {
      mockReadFile.mockResolvedValue(samplePrd);
      const storeFn = jest
        .fn<() => Promise<void>>()
        .mockRejectedValueOnce(new Error('Storage failed'))
        .mockResolvedValue(undefined);

      const result = await indexPrd('/path/to/prd.md', storeFn);

      expect(result.indexed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Storage failed');
    });

    it('should report error when file read fails', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      const result = await indexPrd('/nonexistent/path.md');

      expect(result.indexed).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('File not found');
    });
  });

  describe('reindexPrd', () => {
    it('should skip indexing when no changes', async () => {
      const content = 'unchanged content';
      mockReadFile.mockResolvedValue(content);

      setCachedHashMetadata({
        fileHash: getFileHash(content),
        indexedAt: new Date().toISOString(),
        sectionCount: 1,
      });

      const storeFn = jest.fn<() => Promise<void>>();
      const result = await reindexPrd('/path/to/prd.md', storeFn);

      expect(result.indexed).toBe(0);
      expect(storeFn).not.toHaveBeenCalled();
    });

    it('should reindex when content changed', async () => {
      mockReadFile.mockResolvedValue('## 1. New Content\n\nNew stuff.');

      setCachedHashMetadata({
        fileHash: getFileHash('old content'),
        indexedAt: new Date().toISOString(),
        sectionCount: 1,
      });

      const storeFn = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const result = await reindexPrd('/path/to/prd.md', storeFn);

      expect(result.indexed).toBe(1);
      expect(storeFn).toHaveBeenCalled();
    });
  });
});
