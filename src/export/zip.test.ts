/**
 * ZIP Archive Tests
 *
 * Tests for ZIP archive creation, validation, and utility functions.
 *
 * @module export/zip.test
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  createZipArchive,
  validateZipArchive,
  formatFileSize,
  generateZipFilename,
} from './zip.js';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a temp test directory with a bundle inside
 */
async function createTestEnvironment(): Promise<{ testDir: string; bundleDir: string }> {
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zip-test-'));
  const bundleDir = path.join(testDir, 'test-bundle');
  await fs.mkdir(bundleDir, { recursive: true });

  // Create test files
  await fs.writeFile(
    path.join(bundleDir, 'results.json'),
    JSON.stringify({
      schemaVersion: 1,
      runId: 'test-run',
      candidates: Array(50)
        .fill(null)
        .map((_, i) => ({
          id: `candidate-${i}`,
          title: `Test Candidate ${i}`,
          description: 'A test candidate for compression testing'.repeat(5),
        })),
    })
  );

  await fs.writeFile(
    path.join(bundleDir, 'session.json'),
    JSON.stringify({ sessionId: 'test-session', title: 'Test Session' })
  );

  return { testDir, bundleDir };
}

/**
 * Cleans up test environment
 */
async function cleanupTestEnvironment(testDir: string): Promise<void> {
  await fs.rm(testDir, { recursive: true }).catch(() => {});
}

// ============================================================================
// createZipArchive Tests
// ============================================================================

describe('createZipArchive', () => {
  describe('input validation', () => {
    it('should reject non-existent bundle path', async () => {
      await expect(createZipArchive('/nonexistent/path')).rejects.toThrow(
        'Bundle path does not exist'
      );
    });
  });

  describe('basic functionality', () => {
    it('should create a ZIP file', async () => {
      const { testDir, bundleDir } = await createTestEnvironment();
      try {
        const zipPath = path.join(testDir, 'test.zip');
        const result = await createZipArchive(bundleDir, zipPath);
        const exists = await fs
          .stat(result.zipPath)
          .then(() => true)
          .catch(() => false);
        expect(exists).toBe(true);
      } finally {
        await cleanupTestEnvironment(testDir);
      }
    });

    it('should return the correct zip path', async () => {
      const { testDir, bundleDir } = await createTestEnvironment();
      try {
        const zipPath = path.join(testDir, 'path-test.zip');
        const result = await createZipArchive(bundleDir, zipPath);
        expect(result.zipPath).toBe(zipPath);
      } finally {
        await cleanupTestEnvironment(testDir);
      }
    });

    it('should report file size', async () => {
      const { testDir, bundleDir } = await createTestEnvironment();
      try {
        const zipPath = path.join(testDir, 'size-test.zip');
        const result = await createZipArchive(bundleDir, zipPath);
        expect(result.sizeBytes).toBeGreaterThan(0);
      } finally {
        await cleanupTestEnvironment(testDir);
      }
    });

    it('should count files in archive', async () => {
      const { testDir, bundleDir } = await createTestEnvironment();
      try {
        const zipPath = path.join(testDir, 'count-test.zip');
        const result = await createZipArchive(bundleDir, zipPath);
        expect(result.fileCount).toBeGreaterThan(0);
      } finally {
        await cleanupTestEnvironment(testDir);
      }
    });

    it('should calculate compression ratio', async () => {
      const { testDir, bundleDir } = await createTestEnvironment();
      try {
        const zipPath = path.join(testDir, 'ratio-test.zip');
        const result = await createZipArchive(bundleDir, zipPath);
        expect(result.compressionRatio).toBeGreaterThan(0);
      } finally {
        await cleanupTestEnvironment(testDir);
      }
    });

    it('should achieve compression (ratio > 1)', async () => {
      const { testDir, bundleDir } = await createTestEnvironment();
      try {
        const zipPath = path.join(testDir, 'compress-test.zip');
        const result = await createZipArchive(bundleDir, zipPath);
        expect(result.compressionRatio).toBeGreaterThan(1);
      } finally {
        await cleanupTestEnvironment(testDir);
      }
    });
  });

  describe('default output path', () => {
    it('should use bundle path + .zip if output not specified', async () => {
      const { testDir, bundleDir } = await createTestEnvironment();
      try {
        const result = await createZipArchive(bundleDir);
        expect(result.zipPath).toBe(`${bundleDir}.zip`);
      } finally {
        await cleanupTestEnvironment(testDir);
      }
    });
  });

  describe('compression options', () => {
    it('should respect compression level', async () => {
      const { testDir, bundleDir } = await createTestEnvironment();
      try {
        const zipPathLow = path.join(testDir, 'low.zip');
        const zipPathHigh = path.join(testDir, 'high.zip');

        const resultLow = await createZipArchive(bundleDir, zipPathLow, { compressionLevel: 1 });
        const resultHigh = await createZipArchive(bundleDir, zipPathHigh, { compressionLevel: 9 });

        expect(resultHigh.sizeBytes).toBeLessThanOrEqual(resultLow.sizeBytes);
      } finally {
        await cleanupTestEnvironment(testDir);
      }
    });
  });

  describe('root directory option', () => {
    it('should include root directory when option is set', async () => {
      const { testDir, bundleDir } = await createTestEnvironment();
      try {
        const zipPath = path.join(testDir, 'with-root.zip');
        const result = await createZipArchive(bundleDir, zipPath, {
          includeRootDir: true,
          rootDirName: 'my-export',
        });
        expect(result.fileCount).toBeGreaterThan(0);
      } finally {
        await cleanupTestEnvironment(testDir);
      }
    });
  });
});

// ============================================================================
// validateZipArchive Tests
// ============================================================================

describe('validateZipArchive', () => {
  it('should validate a valid ZIP file', async () => {
    const { testDir, bundleDir } = await createTestEnvironment();
    try {
      const zipPath = path.join(testDir, 'valid.zip');
      await createZipArchive(bundleDir, zipPath);
      const result = await validateZipArchive(zipPath);
      expect(result.valid).toBe(true);
      expect(result.sizeBytes).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();
    } finally {
      await cleanupTestEnvironment(testDir);
    }
  });

  it('should reject non-existent file', async () => {
    const result = await validateZipArchive('/nonexistent/file.zip');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('File does not exist');
  });

  it('should reject directory paths', async () => {
    const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zip-validate-'));
    try {
      const result = await validateZipArchive(testDir);
      expect(result.valid).toBe(false);
      // fileExists returns false for directories, so error is "File does not exist"
      expect(result.error).toBe('File does not exist');
    } finally {
      await cleanupTestEnvironment(testDir);
    }
  });

  it('should reject files too small to be ZIP', async () => {
    const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zip-tiny-'));
    try {
      const tinyFile = path.join(testDir, 'tiny.zip');
      await fs.writeFile(tinyFile, 'tiny');
      const result = await validateZipArchive(tinyFile);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('File too small to be valid ZIP');
    } finally {
      await cleanupTestEnvironment(testDir);
    }
  });

  it('should reject files with invalid ZIP signature', async () => {
    const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zip-fake-'));
    try {
      const fakeZip = path.join(testDir, 'fake.zip');
      await fs.writeFile(fakeZip, 'This is not a real ZIP file but has enough bytes');
      const result = await validateZipArchive(fakeZip);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid ZIP signature');
    } finally {
      await cleanupTestEnvironment(testDir);
    }
  });
});

// ============================================================================
// formatFileSize Tests
// ============================================================================

describe('formatFileSize', () => {
  it('should format 0 bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('should format bytes', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('should format kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1.00 KB');
    expect(formatFileSize(1536)).toBe('1.50 KB');
    expect(formatFileSize(10240)).toBe('10.0 KB');
  });

  it('should format megabytes', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.00 MB');
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.50 MB');
    expect(formatFileSize(100 * 1024 * 1024)).toBe('100 MB');
  });

  it('should format gigabytes', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.00 GB');
    expect(formatFileSize(2.5 * 1024 * 1024 * 1024)).toBe('2.50 GB');
  });

  it('should handle large sizes', () => {
    expect(formatFileSize(1024 * 1024 * 1024 * 1024)).toBe('1.00 TB');
  });
});

// ============================================================================
// generateZipFilename Tests
// ============================================================================

describe('generateZipFilename', () => {
  it('should generate filename with session and run IDs', () => {
    const filename = generateZipFilename('20260115-japan-trip', '20260115-143000');
    expect(filename).toContain('20260115-japan-trip');
    expect(filename).toContain('20260115-143000');
  });

  it('should include date in filename', () => {
    const filename = generateZipFilename('session', 'run');
    expect(filename).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('should end with .zip extension', () => {
    const filename = generateZipFilename('session', 'run');
    expect(filename).toMatch(/\.zip$/);
  });

  it('should use underscore separators', () => {
    const filename = generateZipFilename('my-session', 'my-run');
    expect(filename).toContain('my-session_my-run');
  });
});
