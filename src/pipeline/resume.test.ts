import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  loadStageForResume,
  loadStageMetadataForResume,
  validateStageFile,
  isValidStageFileForResume,
  getStagesToSkip,
  getStagesToExecute,
  createResumeExecutionPlan,
  getInputStageNumber,
  getInputStageId,
} from './resume.js';
import { saveStageFile } from '../storage/stages.js';
import { createRunDir } from '../storage/runs.js';

describe('resume', () => {
  let tempDir: string;
  const originalEnv = process.env.TRAVELAGENT_DATA_DIR;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'resume-test-'));
    process.env.TRAVELAGENT_DATA_DIR = tempDir;
  });

  afterEach(async () => {
    process.env.TRAVELAGENT_DATA_DIR = originalEnv;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const testSessionId = '20260107-test-session';
  const testRunId = '20260107-143512-full';

  // Helper to create valid stage data
  const createValidStageData = (stageNumber: number, stageName: string) => ({
    _meta: {
      stageId: `${stageNumber.toString().padStart(2, '0')}_${stageName}`,
      stageNumber,
      stageName,
      schemaVersion: 1,
      sessionId: testSessionId,
      runId: testRunId,
      createdAt: new Date().toISOString(),
    },
    data: {
      candidates: [{ id: '1', name: 'Test Candidate' }],
    },
  });

  describe('validateStageFile', () => {
    it('should return valid for correct structure', () => {
      const data = createValidStageData(8, 'top_candidates');
      const result = validateStageFile(data, 8);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.stageNumber).toBe(8);
    });

    it('should return invalid for null data', () => {
      const result = validateStageFile(null, 8);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Stage file must be a non-null object');
    });

    it('should return invalid for missing _meta', () => {
      const data = { data: { candidates: [] } };
      const result = validateStageFile(data, 8);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: _meta');
    });

    it('should return invalid for missing data field', () => {
      const data = {
        _meta: {
          stageId: '08_top_candidates',
          stageNumber: 8,
          stageName: 'top_candidates',
          schemaVersion: 1,
          sessionId: testSessionId,
          runId: testRunId,
          createdAt: new Date().toISOString(),
        },
      };
      const result = validateStageFile(data, 8);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: data');
    });

    it('should return invalid for stage number mismatch', () => {
      const data = createValidStageData(7, 'candidates_validated');
      const result = validateStageFile(data, 8);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Stage number mismatch');
    });

    it('should return invalid for malformed _meta', () => {
      const data = {
        _meta: {
          stageId: '08_top_candidates',
          // Missing required fields
        },
        data: {},
      };
      const result = validateStageFile(data, 8);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('isValidStageFileForResume', () => {
    it('should return true for valid stage file', () => {
      const data = createValidStageData(8, 'top_candidates');
      expect(isValidStageFileForResume(data, 8)).toBe(true);
    });

    it('should return false for invalid stage file', () => {
      expect(isValidStageFileForResume(null, 8)).toBe(false);
      expect(isValidStageFileForResume({}, 8)).toBe(false);
    });
  });

  describe('loadStageForResume', () => {
    it('should load and return stage data', async () => {
      await createRunDir(testSessionId, testRunId);
      const stageData = createValidStageData(8, 'top_candidates');
      await saveStageFile(testSessionId, testRunId, '08_top_candidates', stageData);

      const result = await loadStageForResume<{ candidates: { id: string }[] }>(
        testSessionId,
        testRunId,
        8
      );

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].id).toBe('1');
    });

    it('should throw for non-existent file', async () => {
      await expect(
        loadStageForResume(testSessionId, testRunId, 8)
      ).rejects.toThrow(/Stage file not found/);
    });

    it('should throw for invalid stage number', async () => {
      await expect(
        loadStageForResume(testSessionId, testRunId, 11)
      ).rejects.toThrow('Invalid stage number: 11');

      await expect(
        loadStageForResume(testSessionId, testRunId, -1)
      ).rejects.toThrow('Invalid stage number: -1');
    });

    it('should throw for mismatched stage number', async () => {
      await createRunDir(testSessionId, testRunId);
      // Save data with stage 7 metadata
      const stageData = createValidStageData(7, 'candidates_validated');
      // But save it to stage 8 file
      await saveStageFile(testSessionId, testRunId, '08_top_candidates', stageData);

      await expect(loadStageForResume(testSessionId, testRunId, 8)).rejects.toThrow(
        /Stage number mismatch/
      );
    });
  });

  describe('loadStageMetadataForResume', () => {
    it('should load and return stage metadata', async () => {
      await createRunDir(testSessionId, testRunId);
      const stageData = createValidStageData(8, 'top_candidates');
      await saveStageFile(testSessionId, testRunId, '08_top_candidates', stageData);

      const metadata = await loadStageMetadataForResume(testSessionId, testRunId, 8);

      expect(metadata.stageId).toBe('08_top_candidates');
      expect(metadata.stageNumber).toBe(8);
      expect(metadata.stageName).toBe('top_candidates');
    });
  });

  describe('getStagesToSkip', () => {
    it('should return empty array for stage 0', () => {
      const result = getStagesToSkip(0);
      expect(result).toEqual([]);
    });

    it('should return stages 0-7 for stage 8', () => {
      const result = getStagesToSkip(8);

      expect(result).toHaveLength(8);
      expect(result[0]).toBe('00_enhancement');
      expect(result[7]).toBe('07_candidates_validated');
      expect(result).not.toContain('08_top_candidates');
    });

    it('should return all stages 0-9 for stage 10', () => {
      const result = getStagesToSkip(10);
      expect(result).toHaveLength(10);
    });

    it('should return just stage 0 for stage 1', () => {
      const result = getStagesToSkip(1);
      expect(result).toEqual(['00_enhancement']);
    });

    it('should throw for invalid stage number', () => {
      expect(() => getStagesToSkip(11)).toThrow('Invalid stage number: 11');
      expect(() => getStagesToSkip(-1)).toThrow('Invalid stage number: -1');
    });
  });

  describe('getStagesToExecute', () => {
    it('should return all stages 0-10 for stage 0', () => {
      const result = getStagesToExecute(0);

      expect(result).toHaveLength(11);
      expect(result[0]).toBe('00_enhancement');
      expect(result[10]).toBe('10_results');
    });

    it('should return stages 8-10 for stage 8', () => {
      const result = getStagesToExecute(8);

      expect(result).toHaveLength(3);
      expect(result[0]).toBe('08_top_candidates');
      expect(result[1]).toBe('09_aggregator_output');
      expect(result[2]).toBe('10_results');
    });

    it('should return just stage 10 for stage 10', () => {
      const result = getStagesToExecute(10);
      expect(result).toEqual(['10_results']);
    });

    it('should throw for invalid stage number', () => {
      expect(() => getStagesToExecute(11)).toThrow('Invalid stage number: 11');
    });
  });

  describe('createResumeExecutionPlan', () => {
    it('should create plan for stage 8', () => {
      const plan = createResumeExecutionPlan(8);

      expect(plan.fromStage).toBe(8);
      expect(plan.stagesToSkip).toHaveLength(8);
      expect(plan.stagesToExecute).toHaveLength(3);
      expect(plan.inputStage).toBe(7);
      expect(plan.inputStageId).toBe('07_candidates_validated');
    });

    it('should create plan for stage 0 (full run)', () => {
      const plan = createResumeExecutionPlan(0);

      expect(plan.fromStage).toBe(0);
      expect(plan.stagesToSkip).toEqual([]);
      expect(plan.stagesToExecute).toHaveLength(11);
      expect(plan.inputStage).toBe(-1);
      expect(plan.inputStageId).toBe('');
    });

    it('should create plan for stage 1', () => {
      const plan = createResumeExecutionPlan(1);

      expect(plan.fromStage).toBe(1);
      expect(plan.stagesToSkip).toEqual(['00_enhancement']);
      expect(plan.stagesToExecute).toHaveLength(10);
      expect(plan.inputStage).toBe(0);
      expect(plan.inputStageId).toBe('00_enhancement');
    });

    it('should throw for invalid stage number', () => {
      expect(() => createResumeExecutionPlan(11)).toThrow('Invalid stage number: 11');
    });
  });

  describe('getInputStageNumber', () => {
    it('should return previous stage number', () => {
      expect(getInputStageNumber(8)).toBe(7);
      expect(getInputStageNumber(1)).toBe(0);
      expect(getInputStageNumber(10)).toBe(9);
    });

    it('should throw for stage 0', () => {
      expect(() => getInputStageNumber(0)).toThrow('Stage 0 has no input stage');
    });

    it('should throw for invalid stage number', () => {
      expect(() => getInputStageNumber(11)).toThrow('Invalid stage number: 11');
    });
  });

  describe('getInputStageId', () => {
    it('should return previous stage ID', () => {
      expect(getInputStageId(8)).toBe('07_candidates_validated');
      expect(getInputStageId(1)).toBe('00_enhancement');
    });

    it('should throw for stage 0', () => {
      expect(() => getInputStageId(0)).toThrow('Stage 0 has no input stage');
    });
  });
});
