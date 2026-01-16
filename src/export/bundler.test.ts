/**
 * Export Bundler Tests
 *
 * Tests for export bundle creation, validation, and management.
 *
 * @module export/bundler.test
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  createExportBundle,
  validateBundle,
  listBundles,
  deleteBundle,
  type BundleResult,
} from './bundler.js';

// ============================================================================
// Test Setup
// ============================================================================

let testDir: string;
let testSessionId: string;
let testRunId: string;

beforeAll(async () => {
  // Create temp test directory
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'export-test-'));

  // Set environment to use test directory
  process.env.TRAVELAGENT_DATA_DIR = testDir;

  testSessionId = '20260115-test-session';
  testRunId = '20260115-143000-full';

  // Create session structure
  const sessionDir = path.join(testDir, 'sessions', testSessionId);
  const runsDir = path.join(sessionDir, 'runs');
  const runDir = path.join(runsDir, testRunId);
  const exportsDir = path.join(runDir, 'exports');

  await fs.mkdir(exportsDir, { recursive: true });

  // Create test session.json
  await fs.writeFile(
    path.join(sessionDir, 'session.json'),
    JSON.stringify({
      schemaVersion: 1,
      sessionId: testSessionId,
      title: 'Test Session',
      destinations: ['Tokyo'],
      dateRange: { start: '2026-03-01', end: '2026-03-15' },
      flexibility: 'flexible',
      interests: ['food', 'temples'],
      createdAt: '2026-01-15T10:00:00.000Z',
    })
  );

  // Create test triage.json
  await fs.writeFile(
    path.join(sessionDir, 'triage.json'),
    JSON.stringify({
      schemaVersion: 1,
      sessionId: testSessionId,
      entries: [],
      updatedAt: '2026-01-15T10:00:00.000Z',
    })
  );

  // Create test results
  await fs.writeFile(
    path.join(exportsDir, 'results.json'),
    JSON.stringify({
      schemaVersion: 1,
      runId: testRunId,
      candidates: [],
      totalCandidates: 0,
    })
  );

  await fs.writeFile(path.join(exportsDir, 'results.md'), '# Test Results\n\nNo candidates.');

  // Create test cost.json
  await fs.writeFile(
    path.join(runDir, 'cost.json'),
    JSON.stringify({
      schemaVersion: 1,
      runId: testRunId,
      providers: {},
      total: 0,
      currency: 'USD',
    })
  );

  // Create test stage files
  await fs.writeFile(
    path.join(runDir, '01_enhancement.json'),
    JSON.stringify({ stageId: '01_enhancement', data: {} })
  );
  await fs.writeFile(
    path.join(runDir, '02_candidates.json'),
    JSON.stringify({ stageId: '02_candidates', data: {} })
  );

  // Create latest symlink
  await fs.symlink(testRunId, path.join(runsDir, 'latest'));
});

afterAll(async () => {
  // Clean up test directory
  if (testDir) {
    await fs.rm(testDir, { recursive: true });
  }
});

// ============================================================================
// createExportBundle Tests
// ============================================================================

describe('createExportBundle', () => {
  describe('input validation', () => {
    it('should reject empty sessionId', async () => {
      await expect(createExportBundle('', testRunId)).rejects.toThrow('sessionId is required');
    });

    it('should reject whitespace-only sessionId', async () => {
      await expect(createExportBundle('   ', testRunId)).rejects.toThrow('sessionId is required');
    });

    it('should create empty bundle for non-existent session', async () => {
      const result = await createExportBundle('nonexistent-session', testRunId);
      // Empty bundle - no files found
      expect(result.manifest.files).toHaveLength(0);
      // Clean up
      await fs.rm(result.bundlePath, { recursive: true }).catch(() => {});
    });
  });

  describe('default behavior', () => {
    let result: BundleResult;

    beforeAll(async () => {
      result = await createExportBundle(testSessionId, testRunId);
    });

    afterAll(async () => {
      // Clean up created bundle
      if (result?.bundlePath) {
        await fs.rm(result.bundlePath, { recursive: true }).catch(() => {});
      }
    });

    it('should create bundle directory', async () => {
      const stats = await fs.stat(result.bundlePath);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should create manifest.json', async () => {
      const manifestPath = path.join(result.bundlePath, 'manifest.json');
      const exists = await fs
        .stat(manifestPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it('should include session.json', async () => {
      const sessionFile = result.manifest.files.find((f) => f.relativePath === 'session.json');
      expect(sessionFile).toBeDefined();
      expect(sessionFile?.category).toBe('session');
    });

    it('should include triage.json', async () => {
      const triageFile = result.manifest.files.find((f) => f.relativePath === 'triage.json');
      expect(triageFile).toBeDefined();
      expect(triageFile?.category).toBe('triage');
    });

    it('should include results.json', async () => {
      const resultsFile = result.manifest.files.find((f) => f.relativePath === 'results.json');
      expect(resultsFile).toBeDefined();
      expect(resultsFile?.category).toBe('results');
    });

    it('should include results.md', async () => {
      const resultsMd = result.manifest.files.find((f) => f.relativePath === 'results.md');
      expect(resultsMd).toBeDefined();
      expect(resultsMd?.category).toBe('results');
    });

    it('should return correct manifest structure', () => {
      expect(result.manifest.schemaVersion).toBe(1);
      expect(result.manifest.sessionId).toBe(testSessionId);
      expect(result.manifest.runId).toBe(testRunId);
      expect(result.manifest.createdAt).toBeDefined();
    });

    it('should calculate totalSizeBytes', () => {
      expect(result.totalSizeBytes).toBeGreaterThan(0);
    });

    it('should calculate fileCounts', () => {
      expect(result.fileCounts).toBeDefined();
      expect(typeof result.fileCounts.session).toBe('number');
    });
  });

  describe('latest run resolution', () => {
    it('should resolve "latest" to actual run ID', async () => {
      const result = await createExportBundle(testSessionId, 'latest');
      expect(result.manifest.runId).toBe(testRunId);

      // Clean up
      await fs.rm(result.bundlePath, { recursive: true }).catch(() => {});
    });
  });

  describe('includeStages option', () => {
    it('should include stage files when includeStages is true', async () => {
      const result = await createExportBundle(testSessionId, testRunId, { includeStages: true });

      const stageFiles = result.manifest.files.filter((f) => f.category === 'stage');
      expect(stageFiles.length).toBeGreaterThan(0);

      // Clean up
      await fs.rm(result.bundlePath, { recursive: true }).catch(() => {});
    });

    it('should create stages subdirectory', async () => {
      const result = await createExportBundle(testSessionId, testRunId, { includeStages: true });

      const stagesDir = path.join(result.bundlePath, 'stages');
      const exists = await fs
        .stat(stagesDir)
        .then((s) => s.isDirectory())
        .catch(() => false);
      expect(exists).toBe(true);

      // Clean up
      await fs.rm(result.bundlePath, { recursive: true }).catch(() => {});
    });
  });

  describe('custom outputDir option', () => {
    it('should create bundle in custom output directory', async () => {
      const customDir = path.join(testDir, 'custom-export');
      const result = await createExportBundle(testSessionId, testRunId, { outputDir: customDir });

      expect(result.bundlePath.startsWith(customDir)).toBe(true);

      // Clean up
      await fs.rm(customDir, { recursive: true }).catch(() => {});
    });
  });
});

// ============================================================================
// validateBundle Tests
// ============================================================================

describe('validateBundle', () => {
  let bundlePath: string;

  beforeEach(async () => {
    // Create a test bundle
    const result = await createExportBundle(testSessionId, testRunId);
    bundlePath = result.bundlePath;
  });

  afterEach(async () => {
    // Clean up
    if (bundlePath) {
      await fs.rm(bundlePath, { recursive: true }).catch(() => {});
    }
  });

  it('should validate a complete bundle as valid', async () => {
    const result = await validateBundle(bundlePath);
    expect(result.valid).toBe(true);
    expect(result.manifestPresent).toBe(true);
    expect(result.missingRequired).toHaveLength(0);
  });

  it('should detect missing manifest', async () => {
    // Remove manifest
    await fs.rm(path.join(bundlePath, 'manifest.json'));

    const result = await validateBundle(bundlePath);
    expect(result.manifestPresent).toBe(false);
  });

  it('should detect missing required files', async () => {
    // Remove results.json
    await fs.rm(path.join(bundlePath, 'results.json'));

    const result = await validateBundle(bundlePath);
    expect(result.valid).toBe(false);
    expect(result.missingRequired).toContain('results.json');
  });

  it('should list present files', async () => {
    const result = await validateBundle(bundlePath);
    expect(result.presentFiles).toContain('session.json');
    expect(result.presentFiles).toContain('results.json');
  });
});

// ============================================================================
// listBundles Tests
// ============================================================================

describe('listBundles', () => {
  let bundle1Path: string;
  let bundle2Path: string;

  beforeAll(async () => {
    // Create two bundles
    const result1 = await createExportBundle(testSessionId, testRunId);
    bundle1Path = result1.bundlePath;

    // Wait a moment for different timestamp
    await new Promise((resolve) => setTimeout(resolve, 100));

    const result2 = await createExportBundle(testSessionId, testRunId);
    bundle2Path = result2.bundlePath;
  });

  afterAll(async () => {
    // Clean up
    if (bundle1Path) await fs.rm(bundle1Path, { recursive: true }).catch(() => {});
    if (bundle2Path) await fs.rm(bundle2Path, { recursive: true }).catch(() => {});
  });

  it('should list all bundles for a session/run', async () => {
    const bundles = await listBundles(testSessionId, testRunId);
    expect(bundles.length).toBeGreaterThanOrEqual(2);
  });

  it('should return bundles sorted newest first', async () => {
    const bundles = await listBundles(testSessionId, testRunId);
    if (bundles.length >= 2) {
      expect(bundles[0].createdAt >= bundles[1].createdAt).toBe(true);
    }
  });

  it('should return bundle paths', async () => {
    const bundles = await listBundles(testSessionId, testRunId);
    expect(bundles.every((b) => b.bundlePath.length > 0)).toBe(true);
  });

  it('should return empty array for non-existent session', async () => {
    const bundles = await listBundles('nonexistent', 'nonexistent');
    expect(bundles).toHaveLength(0);
  });
});

// ============================================================================
// deleteBundle Tests
// ============================================================================

describe('deleteBundle', () => {
  it('should delete an existing bundle', async () => {
    const result = await createExportBundle(testSessionId, testRunId);
    const bundlePath = result.bundlePath;

    // Verify bundle exists
    const existsBefore = await fs
      .stat(bundlePath)
      .then(() => true)
      .catch(() => false);
    expect(existsBefore).toBe(true);

    // Delete bundle
    await deleteBundle(bundlePath);

    // Verify bundle no longer exists
    const existsAfter = await fs
      .stat(bundlePath)
      .then(() => true)
      .catch(() => false);
    expect(existsAfter).toBe(false);
  });

  it('should reject non-bundle directories', async () => {
    const nonBundleDir = path.join(testDir, 'not-a-bundle');
    await fs.mkdir(nonBundleDir, { recursive: true });

    await expect(deleteBundle(nonBundleDir)).rejects.toThrow(
      'Path does not appear to be an export bundle'
    );

    // Clean up
    await fs.rm(nonBundleDir, { recursive: true }).catch(() => {});
  });
});
