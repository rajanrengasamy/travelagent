/**
 * Tests for Manifest Generation Module
 *
 * @module pipeline/manifest.test
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {
  calculateFileHash,
  generateManifest,
  saveManifest,
  loadManifest,
  verifyManifest,
  createStageEntry,
  type StageFileInfo,
} from './manifest.js';
import { createRunDir } from '../storage/runs.js';
import { saveStageFile } from '../storage/stages.js';
import { getManifestPath, getStageFilePath } from '../storage/paths.js';

describe('manifest', () => {
  let tempDir: string;
  const originalEnv = process.env.TRAVELAGENT_DATA_DIR;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-test-'));
    process.env.TRAVELAGENT_DATA_DIR = tempDir;
  });

  afterEach(async () => {
    process.env.TRAVELAGENT_DATA_DIR = originalEnv;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const testSessionId = '20260102-test-session';
  const testRunId = '20260102-143512-full';

  // Helper to create test stage data
  const createTestStageData = (stageId: string, stageNumber: number) => ({
    _meta: {
      stageId,
      stageNumber,
      stageName: stageId.replace(/^\d{2}_/, ''),
      schemaVersion: 1,
      sessionId: testSessionId,
      runId: testRunId,
      createdAt: new Date().toISOString(),
    },
    data: {
      candidates: [{ id: '1', name: 'Test Candidate' }],
    },
  });

  describe('calculateFileHash', () => {
    it('should return 64-character hex string', async () => {
      const filePath = path.join(tempDir, 'test.json');
      await fs.writeFile(filePath, '{"test": true}');

      const hash = await calculateFileHash(filePath);

      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should return consistent hash for same content', async () => {
      const file1 = path.join(tempDir, 'file1.json');
      const file2 = path.join(tempDir, 'file2.json');
      await fs.writeFile(file1, '{"same": "content"}');
      await fs.writeFile(file2, '{"same": "content"}');

      const hash1 = await calculateFileHash(file1);
      const hash2 = await calculateFileHash(file2);

      expect(hash1).toBe(hash2);
    });

    it('should return different hash for different content', async () => {
      const file1 = path.join(tempDir, 'file1.json');
      const file2 = path.join(tempDir, 'file2.json');
      await fs.writeFile(file1, '{"a": 1}');
      await fs.writeFile(file2, '{"a": 2}');

      const hash1 = await calculateFileHash(file1);
      const hash2 = await calculateFileHash(file2);

      expect(hash1).not.toBe(hash2);
    });

    it('should throw for non-existent file', async () => {
      await expect(calculateFileHash('/nonexistent/file.json')).rejects.toThrow();
    });

    it('should match Node crypto SHA-256 directly', async () => {
      const content = '{"verify": "hash"}';
      const filePath = path.join(tempDir, 'verify.json');
      await fs.writeFile(filePath, content);

      const hash = await calculateFileHash(filePath);
      const expectedHash = crypto
        .createHash('sha256')
        .update(Buffer.from(content))
        .digest('hex');

      expect(hash).toBe(expectedHash);
    });

    it('should handle binary content correctly', async () => {
      const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);
      const filePath = path.join(tempDir, 'binary.bin');
      await fs.writeFile(filePath, binaryContent);

      const hash = await calculateFileHash(filePath);

      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle empty file', async () => {
      const filePath = path.join(tempDir, 'empty.json');
      await fs.writeFile(filePath, '');

      const hash = await calculateFileHash(filePath);

      // SHA-256 of empty string
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });
  });

  describe('createStageEntry', () => {
    it('should create entry with correct fields', async () => {
      await createRunDir(testSessionId, testRunId);
      const stageData = createTestStageData('08_top_candidates', 8);
      await saveStageFile(testSessionId, testRunId, '08_top_candidates', stageData);

      const entry = await createStageEntry(
        testSessionId,
        testRunId,
        '08_top_candidates',
        '07_validated'
      );

      expect(entry.stageId).toBe('08_top_candidates');
      expect(entry.filename).toBe('08_top_candidates.json');
      expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(entry.sizeBytes).toBeGreaterThan(0);
      expect(entry.upstreamStage).toBe('07_validated');
      expect(entry.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO8601 format
    });

    it('should work without upstream stage', async () => {
      await createRunDir(testSessionId, testRunId);
      const stageData = createTestStageData('01_intake', 1);
      await saveStageFile(testSessionId, testRunId, '01_intake', stageData);

      const entry = await createStageEntry(testSessionId, testRunId, '01_intake');

      expect(entry.stageId).toBe('01_intake');
      expect(entry.upstreamStage).toBeUndefined();
    });

    it('should throw for non-existent stage file', async () => {
      await expect(
        createStageEntry(testSessionId, testRunId, '08_top_candidates')
      ).rejects.toThrow();
    });
  });

  describe('generateManifest', () => {
    it('should create manifest with all executed stages', async () => {
      await createRunDir(testSessionId, testRunId);

      // Create test stage files
      await saveStageFile(
        testSessionId,
        testRunId,
        '08_top_candidates',
        createTestStageData('08_top_candidates', 8)
      );
      await saveStageFile(
        testSessionId,
        testRunId,
        '09_aggregator_output',
        createTestStageData('09_aggregator_output', 9)
      );

      const executedStages: StageFileInfo[] = [
        { stageId: '08_top_candidates', stageNumber: 8, upstreamStage: '07_validated' },
        { stageId: '09_aggregator_output', stageNumber: 9, upstreamStage: '08_top_candidates' },
      ];

      const manifest = await generateManifest(
        testSessionId,
        testRunId,
        executedStages,
        [],
        true
      );

      expect(manifest.runId).toBe(testRunId);
      expect(manifest.sessionId).toBe(testSessionId);
      expect(manifest.stages).toHaveLength(2);
      expect(manifest.stagesExecuted).toEqual(['08_top_candidates', '09_aggregator_output']);
      expect(manifest.stagesSkipped).toEqual([]);
      expect(manifest.success).toBe(true);
    });

    it('should include skipped stages', async () => {
      await createRunDir(testSessionId, testRunId);
      await saveStageFile(
        testSessionId,
        testRunId,
        '08_top_candidates',
        createTestStageData('08_top_candidates', 8)
      );

      const executedStages: StageFileInfo[] = [
        { stageId: '08_top_candidates', stageNumber: 8 },
      ];
      const skippedStages = ['00_enhancement', '01_intake', '02_router'];

      const manifest = await generateManifest(
        testSessionId,
        testRunId,
        executedStages,
        skippedStages,
        true
      );

      expect(manifest.stagesSkipped).toEqual(skippedStages);
      expect(manifest.stagesExecuted).toEqual(['08_top_candidates']);
    });

    it('should set finalStage correctly', async () => {
      await createRunDir(testSessionId, testRunId);
      await saveStageFile(
        testSessionId,
        testRunId,
        '08_top_candidates',
        createTestStageData('08_top_candidates', 8)
      );
      await saveStageFile(
        testSessionId,
        testRunId,
        '09_aggregator_output',
        createTestStageData('09_aggregator_output', 9)
      );
      await saveStageFile(
        testSessionId,
        testRunId,
        '10_results',
        createTestStageData('10_results', 10)
      );

      const executedStages: StageFileInfo[] = [
        { stageId: '08_top_candidates', stageNumber: 8 },
        { stageId: '09_aggregator_output', stageNumber: 9 },
        { stageId: '10_results', stageNumber: 10 },
      ];

      const manifest = await generateManifest(
        testSessionId,
        testRunId,
        executedStages,
        [],
        true
      );

      expect(manifest.finalStage).toBe('10_results');
    });

    it('should set success flag correctly for failed runs', async () => {
      await createRunDir(testSessionId, testRunId);
      await saveStageFile(
        testSessionId,
        testRunId,
        '08_top_candidates',
        createTestStageData('08_top_candidates', 8)
      );

      const manifest = await generateManifest(
        testSessionId,
        testRunId,
        [{ stageId: '08_top_candidates', stageNumber: 8 }],
        [],
        false
      );

      expect(manifest.success).toBe(false);
    });

    it('should include upstream stage in entries', async () => {
      await createRunDir(testSessionId, testRunId);
      await saveStageFile(
        testSessionId,
        testRunId,
        '09_aggregator_output',
        createTestStageData('09_aggregator_output', 9)
      );

      const executedStages: StageFileInfo[] = [
        { stageId: '09_aggregator_output', stageNumber: 9, upstreamStage: '08_top_candidates' },
      ];

      const manifest = await generateManifest(
        testSessionId,
        testRunId,
        executedStages,
        [],
        true
      );

      expect(manifest.stages[0].upstreamStage).toBe('08_top_candidates');
    });

    it('should handle empty executed stages', async () => {
      await createRunDir(testSessionId, testRunId);

      const manifest = await generateManifest(
        testSessionId,
        testRunId,
        [],
        ['00_enhancement'],
        false
      );

      expect(manifest.stages).toHaveLength(0);
      expect(manifest.stagesExecuted).toHaveLength(0);
      expect(manifest.stagesSkipped).toEqual(['00_enhancement']);
    });
  });

  describe('saveManifest', () => {
    it('should write manifest to correct path', async () => {
      await createRunDir(testSessionId, testRunId);
      await saveStageFile(
        testSessionId,
        testRunId,
        '08_top_candidates',
        createTestStageData('08_top_candidates', 8)
      );

      const manifest = await generateManifest(
        testSessionId,
        testRunId,
        [{ stageId: '08_top_candidates', stageNumber: 8 }],
        [],
        true
      );

      const savedPath = await saveManifest(testSessionId, testRunId, manifest);

      expect(savedPath).toBe(getManifestPath(testSessionId, testRunId));

      // Verify file exists and contains correct data
      const content = await fs.readFile(savedPath, 'utf-8');
      const loaded = JSON.parse(content);
      expect(loaded.runId).toBe(testRunId);
      expect(loaded.sessionId).toBe(testSessionId);
    });

    it('should use atomic write (file is valid after save)', async () => {
      await createRunDir(testSessionId, testRunId);
      await saveStageFile(
        testSessionId,
        testRunId,
        '08_top_candidates',
        createTestStageData('08_top_candidates', 8)
      );

      const manifest = await generateManifest(
        testSessionId,
        testRunId,
        [{ stageId: '08_top_candidates', stageNumber: 8 }],
        [],
        true
      );

      await saveManifest(testSessionId, testRunId, manifest);

      // File should be complete and parseable immediately
      const loaded = await loadManifest(testSessionId, testRunId);
      expect(loaded).not.toBeNull();
      expect(loaded!.runId).toBe(testRunId);
    });
  });

  describe('loadManifest', () => {
    it('should load existing manifest', async () => {
      await createRunDir(testSessionId, testRunId);
      await saveStageFile(
        testSessionId,
        testRunId,
        '08_top_candidates',
        createTestStageData('08_top_candidates', 8)
      );

      const manifest = await generateManifest(
        testSessionId,
        testRunId,
        [{ stageId: '08_top_candidates', stageNumber: 8 }],
        [],
        true
      );
      await saveManifest(testSessionId, testRunId, manifest);

      const loaded = await loadManifest(testSessionId, testRunId);

      expect(loaded).not.toBeNull();
      expect(loaded!.runId).toBe(testRunId);
      expect(loaded!.stages).toHaveLength(1);
    });

    it('should return null for non-existent manifest', async () => {
      const loaded = await loadManifest(testSessionId, 'nonexistent-run');

      expect(loaded).toBeNull();
    });
  });

  describe('verifyManifest', () => {
    it('should return valid=true when all hashes match', async () => {
      await createRunDir(testSessionId, testRunId);
      await saveStageFile(
        testSessionId,
        testRunId,
        '08_top_candidates',
        createTestStageData('08_top_candidates', 8)
      );
      await saveStageFile(
        testSessionId,
        testRunId,
        '09_aggregator_output',
        createTestStageData('09_aggregator_output', 9)
      );

      const manifest = await generateManifest(
        testSessionId,
        testRunId,
        [
          { stageId: '08_top_candidates', stageNumber: 8 },
          { stageId: '09_aggregator_output', stageNumber: 9 },
        ],
        [],
        true
      );
      await saveManifest(testSessionId, testRunId, manifest);

      const result = await verifyManifest(testSessionId, testRunId);

      expect(result.valid).toBe(true);
      expect(result.stages).toHaveLength(2);
      expect(result.stages.every((s) => s.matches)).toBe(true);
    });

    it('should return valid=false when hash mismatch', async () => {
      await createRunDir(testSessionId, testRunId);
      await saveStageFile(
        testSessionId,
        testRunId,
        '08_top_candidates',
        createTestStageData('08_top_candidates', 8)
      );

      const manifest = await generateManifest(
        testSessionId,
        testRunId,
        [{ stageId: '08_top_candidates', stageNumber: 8 }],
        [],
        true
      );
      await saveManifest(testSessionId, testRunId, manifest);

      // Modify the stage file to cause hash mismatch
      const stagePath = getStageFilePath(testSessionId, testRunId, '08_top_candidates');
      await fs.writeFile(stagePath, '{"modified": true}');

      const result = await verifyManifest(testSessionId, testRunId);

      expect(result.valid).toBe(false);
      expect(result.stages[0].matches).toBe(false);
      expect(result.stages[0].expectedHash).not.toBe(result.stages[0].actualHash);
    });

    it('should return valid=false when stage file is missing', async () => {
      await createRunDir(testSessionId, testRunId);
      await saveStageFile(
        testSessionId,
        testRunId,
        '08_top_candidates',
        createTestStageData('08_top_candidates', 8)
      );

      const manifest = await generateManifest(
        testSessionId,
        testRunId,
        [{ stageId: '08_top_candidates', stageNumber: 8 }],
        [],
        true
      );
      await saveManifest(testSessionId, testRunId, manifest);

      // Delete the stage file
      const stagePath = getStageFilePath(testSessionId, testRunId, '08_top_candidates');
      await fs.rm(stagePath);

      const result = await verifyManifest(testSessionId, testRunId);

      expect(result.valid).toBe(false);
      expect(result.stages[0].matches).toBe(false);
      expect(result.stages[0].actualHash).toBe('<file_not_found>');
    });

    it('should throw for non-existent manifest', async () => {
      await expect(verifyManifest(testSessionId, 'nonexistent-run')).rejects.toThrow(
        /Manifest not found/
      );
    });

    it('should throw descriptive error for corrupted manifest', async () => {
      await createRunDir(testSessionId, testRunId);
      const manifestPath = getManifestPath(testSessionId, testRunId);
      await fs.writeFile(manifestPath, 'not valid json {{{');

      await expect(verifyManifest(testSessionId, testRunId)).rejects.toThrow(
        /Invalid.*manifest/i
      );
    });

    it('should verify multiple stages independently', async () => {
      await createRunDir(testSessionId, testRunId);
      await saveStageFile(
        testSessionId,
        testRunId,
        '08_top_candidates',
        createTestStageData('08_top_candidates', 8)
      );
      await saveStageFile(
        testSessionId,
        testRunId,
        '09_aggregator_output',
        createTestStageData('09_aggregator_output', 9)
      );

      const manifest = await generateManifest(
        testSessionId,
        testRunId,
        [
          { stageId: '08_top_candidates', stageNumber: 8 },
          { stageId: '09_aggregator_output', stageNumber: 9 },
        ],
        [],
        true
      );
      await saveManifest(testSessionId, testRunId, manifest);

      // Modify only one stage file
      const stagePath = getStageFilePath(testSessionId, testRunId, '08_top_candidates');
      await fs.writeFile(stagePath, '{"modified": true}');

      const result = await verifyManifest(testSessionId, testRunId);

      expect(result.valid).toBe(false);
      // First stage should be corrupted
      expect(result.stages[0].stageId).toBe('08_top_candidates');
      expect(result.stages[0].matches).toBe(false);
      // Second stage should still be valid
      expect(result.stages[1].stageId).toBe('09_aggregator_output');
      expect(result.stages[1].matches).toBe(true);
    });
  });
});
