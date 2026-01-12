import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  writeCheckpoint,
  readCheckpointData,
  readCheckpointMetadata,
  readCheckpoint,
  validateCheckpointStructure,
  getCheckpointValidationErrors,
  type Checkpoint,
} from './checkpoint.js';
import { getStageFilePath } from '../storage/index.js';

describe('checkpoint', () => {
  let testDir: string;
  const originalEnv = process.env.TRAVELAGENT_DATA_DIR;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'checkpoint-test-'));
    process.env.TRAVELAGENT_DATA_DIR = testDir;
  });

  afterEach(async () => {
    process.env.TRAVELAGENT_DATA_DIR = originalEnv;
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('writeCheckpoint', () => {
    it('should create checkpoint file with correct structure', async () => {
      const result = await writeCheckpoint(
        'session-1',
        'run-1',
        8,
        'top_candidates',
        { candidates: [{ id: 1 }] }
      );

      expect(result.filePath).toContain('08_top_candidates.json');
      expect(result.metadata.stageId).toBe('08_top_candidates');
      expect(result.metadata.stageNumber).toBe(8);
      expect(result.metadata.stageName).toBe('top_candidates');
      expect(result.metadata.sessionId).toBe('session-1');
      expect(result.metadata.runId).toBe('run-1');
      expect(result.sizeBytes).toBeGreaterThan(0);

      // Verify file content
      const content = await fs.readFile(result.filePath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed._meta).toBeDefined();
      expect(parsed.data).toEqual({ candidates: [{ id: 1 }] });
    });

    it('should include upstreamStage in metadata when provided', async () => {
      const result = await writeCheckpoint(
        'session-1',
        'run-1',
        8,
        'top_candidates',
        { candidates: [] },
        { upstreamStage: '07_candidates_validated' }
      );

      expect(result.metadata.upstreamStage).toBe('07_candidates_validated');

      // Verify in file
      const content = await fs.readFile(result.filePath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed._meta.upstreamStage).toBe('07_candidates_validated');
    });

    it('should include config in metadata when provided', async () => {
      const result = await writeCheckpoint(
        'session-1',
        'run-1',
        8,
        'top_candidates',
        { candidates: [] },
        { config: { maxCandidates: 50, threshold: 0.8 } }
      );

      expect(result.metadata.config).toEqual({ maxCandidates: 50, threshold: 0.8 });

      // Verify in file
      const content = await fs.readFile(result.filePath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed._meta.config).toEqual({ maxCandidates: 50, threshold: 0.8 });
    });

    it('should include schemaVersion in metadata', async () => {
      const result = await writeCheckpoint(
        'session-1',
        'run-1',
        5,
        'candidates_deduped',
        { clusters: [] }
      );

      expect(result.metadata.schemaVersion).toBe(1);
    });

    it('should include createdAt timestamp in ISO8601 format', async () => {
      const before = new Date().toISOString();
      const result = await writeCheckpoint(
        'session-1',
        'run-1',
        6,
        'candidates_ranked',
        { candidates: [] }
      );
      const after = new Date().toISOString();

      expect(result.metadata.createdAt).toBeDefined();
      // Verify timestamp is valid ISO8601
      expect(() => new Date(result.metadata.createdAt)).not.toThrow();
      // Verify timestamp is within expected range
      expect(result.metadata.createdAt >= before).toBe(true);
      expect(result.metadata.createdAt <= after).toBe(true);
    });

    it('should create parent directories if needed', async () => {
      // Write to a new session/run that doesn't exist yet
      const result = await writeCheckpoint(
        'new-session',
        'new-run',
        5,
        'candidates_deduped',
        { clusters: [] }
      );

      expect(result.filePath).toBeDefined();
      const content = await fs.readFile(result.filePath, 'utf-8');
      expect(JSON.parse(content)).toHaveProperty('_meta');
      expect(JSON.parse(content)).toHaveProperty('data');
    });

    it('should use atomic write (no partial files remain)', async () => {
      await writeCheckpoint(
        'session-atomic',
        'run-atomic',
        4,
        'candidates_normalized',
        { items: [1, 2, 3] }
      );

      // Check that no temp files remain in the directory
      const runDir = path.dirname(
        getStageFilePath('session-atomic', 'run-atomic', '04_candidates_normalized')
      );
      const files = await fs.readdir(runDir);
      const tempFiles = files.filter((f) => f.includes('.tmp.'));
      expect(tempFiles).toHaveLength(0);
    });

    it('should handle complex nested data', async () => {
      const complexData = {
        candidates: [
          {
            id: 'c1',
            name: 'Test Place',
            location: { lat: 35.6762, lng: 139.6503 },
            sourceRefs: [
              { url: 'https://example.com', publisher: 'Test' },
            ],
          },
        ],
        metadata: {
          count: 1,
          filters: ['active', 'verified'],
        },
      };

      const result = await writeCheckpoint(
        'session-complex',
        'run-complex',
        8,
        'top_candidates',
        complexData
      );

      const content = await fs.readFile(result.filePath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.data).toEqual(complexData);
    });

    it('should handle all stage numbers 0-10', async () => {
      const stages = [
        { num: 0, name: 'enhancement' },
        { num: 1, name: 'intake' },
        { num: 2, name: 'router' },
        { num: 3, name: 'worker_outputs' },
        { num: 4, name: 'candidates_normalized' },
        { num: 5, name: 'candidates_deduped' },
        { num: 6, name: 'candidates_ranked' },
        { num: 7, name: 'candidates_validated' },
        { num: 8, name: 'top_candidates' },
        { num: 9, name: 'aggregator_output' },
        { num: 10, name: 'results' },
      ];

      for (const stage of stages) {
        const result = await writeCheckpoint(
          'session-all',
          'run-all',
          stage.num,
          stage.name,
          { test: true }
        );

        const expectedStageId = `${stage.num.toString().padStart(2, '0')}_${stage.name}`;
        expect(result.metadata.stageId).toBe(expectedStageId);
        expect(result.metadata.stageNumber).toBe(stage.num);
      }
    });
  });

  describe('readCheckpointData', () => {
    it('should return just the data without metadata', async () => {
      const testData = { candidates: [{ id: 1, name: 'Test' }] };
      await writeCheckpoint('s1', 'r1', 8, 'top_candidates', testData);

      const data = await readCheckpointData<typeof testData>('s1', 'r1', '08_top_candidates');
      expect(data).toEqual(testData);
    });

    it('should handle null data', async () => {
      await writeCheckpoint('s1', 'r1', 4, 'normalized', null);

      const data = await readCheckpointData<null>('s1', 'r1', '04_normalized');
      expect(data).toBeNull();
    });

    it('should handle array data', async () => {
      const arrayData = [1, 2, 3, 4, 5];
      await writeCheckpoint('s1', 'r1', 5, 'deduped', arrayData);

      const data = await readCheckpointData<number[]>('s1', 'r1', '05_deduped');
      expect(data).toEqual(arrayData);
    });

    it('should throw for non-existent checkpoint', async () => {
      await expect(
        readCheckpointData('nonexistent', 'run', '08_top_candidates')
      ).rejects.toThrow(/Stage file not found/);
    });

    it('should throw for invalid checkpoint structure', async () => {
      // Create a file without proper checkpoint structure
      const sessionDir = path.join(testDir, 'sessions', 'bad-session', 'runs', 'bad-run');
      await fs.mkdir(sessionDir, { recursive: true });
      await fs.writeFile(
        path.join(sessionDir, '08_top_candidates.json'),
        JSON.stringify({ notMeta: true, notData: true })
      );

      await expect(
        readCheckpointData('bad-session', 'bad-run', '08_top_candidates')
      ).rejects.toThrow(/Invalid checkpoint structure/);
    });
  });

  describe('readCheckpointMetadata', () => {
    it('should return just the metadata', async () => {
      await writeCheckpoint('s1', 'r1', 8, 'top_candidates', { x: 1 });

      const meta = await readCheckpointMetadata('s1', 'r1', '08_top_candidates');
      expect(meta.stageId).toBe('08_top_candidates');
      expect(meta.sessionId).toBe('s1');
      expect(meta.runId).toBe('r1');
      expect(meta.stageNumber).toBe(8);
      expect(meta.stageName).toBe('top_candidates');
    });

    it('should include optional fields when provided', async () => {
      await writeCheckpoint(
        's1',
        'r1',
        8,
        'top_candidates',
        {},
        {
          upstreamStage: '07_validated',
          config: { limit: 30 },
        }
      );

      const meta = await readCheckpointMetadata('s1', 'r1', '08_top_candidates');
      expect(meta.upstreamStage).toBe('07_validated');
      expect(meta.config).toEqual({ limit: 30 });
    });

    it('should throw for non-existent checkpoint', async () => {
      await expect(
        readCheckpointMetadata('nonexistent', 'run', '08_top_candidates')
      ).rejects.toThrow(/Stage file not found/);
    });
  });

  describe('readCheckpoint', () => {
    it('should return full checkpoint with both _meta and data', async () => {
      const testData = { items: [1, 2, 3] };
      await writeCheckpoint(
        's1',
        'r1',
        6,
        'ranked',
        testData,
        { config: { weights: [0.5, 0.3, 0.2] } }
      );

      const checkpoint = await readCheckpoint<typeof testData>('s1', 'r1', '06_ranked');
      expect(checkpoint._meta.stageId).toBe('06_ranked');
      expect(checkpoint._meta.config).toEqual({ weights: [0.5, 0.3, 0.2] });
      expect(checkpoint.data).toEqual(testData);
    });
  });

  describe('validateCheckpointStructure', () => {
    it('should return true for valid checkpoint', () => {
      const validCheckpoint: Checkpoint = {
        _meta: {
          stageId: '08_top_candidates',
          stageNumber: 8,
          stageName: 'top_candidates',
          schemaVersion: 1,
          sessionId: 'session-1',
          runId: 'run-1',
          createdAt: new Date().toISOString(),
        },
        data: { candidates: [] },
      };

      expect(validateCheckpointStructure(validCheckpoint)).toBe(true);
    });

    it('should return true for checkpoint with null data', () => {
      const checkpoint: Checkpoint = {
        _meta: {
          stageId: '08_top_candidates',
          stageNumber: 8,
          stageName: 'top_candidates',
          schemaVersion: 1,
          sessionId: 'session-1',
          runId: 'run-1',
          createdAt: new Date().toISOString(),
        },
        data: null,
      };

      expect(validateCheckpointStructure(checkpoint)).toBe(true);
    });

    it('should return false for missing _meta', () => {
      const invalid = { data: { candidates: [] } };
      expect(validateCheckpointStructure(invalid)).toBe(false);
    });

    it('should return false for missing data', () => {
      const invalid = {
        _meta: {
          stageId: '08_top_candidates',
          stageNumber: 8,
          stageName: 'top_candidates',
          schemaVersion: 1,
          sessionId: 'session-1',
          runId: 'run-1',
          createdAt: new Date().toISOString(),
        },
      };
      expect(validateCheckpointStructure(invalid)).toBe(false);
    });

    it('should return false for invalid _meta structure', () => {
      const invalid = {
        _meta: {
          stageId: '08_top_candidates',
          // Missing required fields
        },
        data: {},
      };
      expect(validateCheckpointStructure(invalid)).toBe(false);
    });

    it('should return false for invalid stageId format in _meta', () => {
      const invalid = {
        _meta: {
          stageId: 'invalid-format', // Should be NN_stage_name
          stageNumber: 8,
          stageName: 'top_candidates',
          schemaVersion: 1,
          sessionId: 'session-1',
          runId: 'run-1',
          createdAt: new Date().toISOString(),
        },
        data: {},
      };
      expect(validateCheckpointStructure(invalid)).toBe(false);
    });

    it('should return false for null', () => {
      expect(validateCheckpointStructure(null)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(validateCheckpointStructure('string')).toBe(false);
      expect(validateCheckpointStructure(123)).toBe(false);
      expect(validateCheckpointStructure([])).toBe(false);
    });

    it('should return false for undefined _meta', () => {
      const invalid = { _meta: undefined, data: {} };
      expect(validateCheckpointStructure(invalid)).toBe(false);
    });
  });

  describe('getCheckpointValidationErrors', () => {
    it('should return empty array for valid checkpoint', () => {
      const validCheckpoint: Checkpoint = {
        _meta: {
          stageId: '08_top_candidates',
          stageNumber: 8,
          stageName: 'top_candidates',
          schemaVersion: 1,
          sessionId: 'session-1',
          runId: 'run-1',
          createdAt: new Date().toISOString(),
        },
        data: {},
      };

      expect(getCheckpointValidationErrors(validCheckpoint)).toEqual([]);
    });

    it('should return error for missing _meta', () => {
      const invalid = { data: {} };
      const errors = getCheckpointValidationErrors(invalid);
      expect(errors).toContain('Missing required field: _meta');
    });

    it('should return error for missing data', () => {
      const invalid = {
        _meta: {
          stageId: '08_top_candidates',
          stageNumber: 8,
          stageName: 'top_candidates',
          schemaVersion: 1,
          sessionId: 'session-1',
          runId: 'run-1',
          createdAt: new Date().toISOString(),
        },
      };
      const errors = getCheckpointValidationErrors(invalid);
      expect(errors).toContain('Missing required field: data');
    });

    it('should return detailed _meta validation errors', () => {
      const invalid = {
        _meta: {
          stageId: 'invalid',
          stageNumber: 'not-a-number', // Should be number
        },
        data: {},
      };
      const errors = getCheckpointValidationErrors(invalid);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('_meta'))).toBe(true);
    });

    it('should return error for non-object input', () => {
      const errors = getCheckpointValidationErrors('not an object');
      expect(errors).toContain('Checkpoint must be a non-null object');
    });

    it('should return multiple errors when both fields missing', () => {
      const errors = getCheckpointValidationErrors({});
      expect(errors).toContain('Missing required field: _meta');
      expect(errors).toContain('Missing required field: data');
    });
  });
});
