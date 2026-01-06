import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { z } from 'zod';
import {
  saveStageFile,
  loadStageFile,
  stageFileExists,
  listStageFiles,
} from './stages.js';
import { createRunDir } from './runs.js';
import { getRunDir } from './paths.js';

describe('stages storage', () => {
  let tempDir: string;
  const originalEnv = process.env.TRAVELAGENT_DATA_DIR;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stages-test-'));
    process.env.TRAVELAGENT_DATA_DIR = tempDir;
  });

  afterEach(async () => {
    process.env.TRAVELAGENT_DATA_DIR = originalEnv;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const testSessionId = '20260102-test-session';
  const testRunId = '20260102-143512-full';

  const testStageData = {
    _meta: {
      stageId: '08_top_candidates',
      stageNumber: 8,
      stageName: 'top_candidates',
      schemaVersion: 1,
      sessionId: testSessionId,
      runId: testRunId,
      createdAt: new Date().toISOString(),
    },
    data: {
      candidates: [{ id: '1', name: 'Test Candidate' }],
    },
  };

  describe('saveStageFile', () => {
    it('creates stage file', async () => {
      await createRunDir(testSessionId, testRunId);
      await saveStageFile(
        testSessionId,
        testRunId,
        '08_top_candidates',
        testStageData
      );

      const filePath = path.join(
        getRunDir(testSessionId, testRunId),
        '08_top_candidates.json'
      );
      const content = await fs.readFile(filePath, 'utf-8');
      const saved = JSON.parse(content);

      expect(saved._meta.stageId).toBe('08_top_candidates');
      expect(saved.data.candidates).toHaveLength(1);
    });

    it('creates parent directories', async () => {
      await saveStageFile(
        testSessionId,
        testRunId,
        '04_candidates_normalized',
        { test: true }
      );

      const exists = await stageFileExists(
        testSessionId,
        testRunId,
        '04_candidates_normalized'
      );
      expect(exists).toBe(true);
    });

    it('throws for invalid stageId format - missing number prefix', async () => {
      await expect(
        saveStageFile(testSessionId, testRunId, 'top_candidates', {})
      ).rejects.toThrow('Invalid stageId format');
    });

    it('throws for invalid stageId format - single digit prefix', async () => {
      await expect(
        saveStageFile(testSessionId, testRunId, '8_top_candidates', {})
      ).rejects.toThrow('Invalid stageId format');
    });

    it('throws for invalid stageId format - uppercase letters', async () => {
      await expect(
        saveStageFile(testSessionId, testRunId, '08_TopCandidates', {})
      ).rejects.toThrow('Invalid stageId format');
    });

    it('throws for invalid stageId format - missing underscore', async () => {
      await expect(
        saveStageFile(testSessionId, testRunId, '08candidates', {})
      ).rejects.toThrow('Invalid stageId format');
    });
  });

  describe('loadStageFile', () => {
    it('returns stage data without schema (backward compatibility)', async () => {
      await createRunDir(testSessionId, testRunId);
      await saveStageFile(
        testSessionId,
        testRunId,
        '08_top_candidates',
        testStageData
      );

      const loaded = await loadStageFile<typeof testStageData>(
        testSessionId,
        testRunId,
        '08_top_candidates'
      );

      expect(loaded._meta.stageNumber).toBe(8);
      expect(loaded.data.candidates[0].name).toBe('Test Candidate');
    });

    it('validates data with schema when provided', async () => {
      // Define a schema matching testStageData structure
      const TestStageSchema = z.object({
        _meta: z.object({
          stageId: z.string(),
          stageNumber: z.number(),
          stageName: z.string(),
          schemaVersion: z.number(),
          sessionId: z.string(),
          runId: z.string(),
          createdAt: z.string(),
        }),
        data: z.object({
          candidates: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
            })
          ),
        }),
      });

      await createRunDir(testSessionId, testRunId);
      await saveStageFile(
        testSessionId,
        testRunId,
        '08_top_candidates',
        testStageData
      );

      const loaded = await loadStageFile(
        testSessionId,
        testRunId,
        '08_top_candidates',
        TestStageSchema
      );

      expect(loaded._meta.stageNumber).toBe(8);
      expect(loaded.data.candidates[0].name).toBe('Test Candidate');
    });

    it('throws ZodError when data does not match schema', async () => {
      // Define a schema that expects different structure
      const StrictSchema = z.object({
        requiredField: z.string(),
        anotherRequired: z.number(),
      });

      await createRunDir(testSessionId, testRunId);
      await saveStageFile(
        testSessionId,
        testRunId,
        '08_top_candidates',
        testStageData
      );

      await expect(
        loadStageFile(
          testSessionId,
          testRunId,
          '08_top_candidates',
          StrictSchema
        )
      ).rejects.toThrow(z.ZodError);
    });

    it('throws for non-existent file', async () => {
      await expect(
        loadStageFile(testSessionId, testRunId, '08_top_candidates')
      ).rejects.toThrow(/Stage file not found: 08_top_candidates in run .* \(path: /);
    });

    it('throws for non-existent file even with schema provided', async () => {
      const AnySchema = z.object({});
      await expect(
        loadStageFile(testSessionId, testRunId, '08_top_candidates', AnySchema)
      ).rejects.toThrow(/Stage file not found: 08_top_candidates in run .* \(path: /);
    });
  });

  describe('stageFileExists', () => {
    it('returns true for existing file', async () => {
      await createRunDir(testSessionId, testRunId);
      await saveStageFile(
        testSessionId,
        testRunId,
        '08_top_candidates',
        testStageData
      );

      const exists = await stageFileExists(
        testSessionId,
        testRunId,
        '08_top_candidates'
      );
      expect(exists).toBe(true);
    });

    it('returns false for non-existent file', async () => {
      const exists = await stageFileExists(
        testSessionId,
        testRunId,
        '08_top_candidates'
      );
      expect(exists).toBe(false);
    });
  });

  describe('listStageFiles', () => {
    it('returns stage IDs', async () => {
      await createRunDir(testSessionId, testRunId);
      await saveStageFile(testSessionId, testRunId, '04_normalized', {});
      await saveStageFile(testSessionId, testRunId, '08_top_candidates', {});

      const stages = await listStageFiles(testSessionId, testRunId);

      expect(stages).toContain('04_normalized');
      expect(stages).toContain('08_top_candidates');
    });

    it('excludes non-stage files', async () => {
      await createRunDir(testSessionId, testRunId);
      await saveStageFile(testSessionId, testRunId, '08_top_candidates', {});

      // Create non-stage files
      const runDir = getRunDir(testSessionId, testRunId);
      await fs.writeFile(path.join(runDir, 'run.json'), '{}');
      await fs.writeFile(path.join(runDir, 'manifest.json'), '{}');

      const stages = await listStageFiles(testSessionId, testRunId);

      expect(stages).toContain('08_top_candidates');
      expect(stages).not.toContain('run');
      expect(stages).not.toContain('manifest');
    });

    it('sorts by stage number', async () => {
      await createRunDir(testSessionId, testRunId);
      await saveStageFile(testSessionId, testRunId, '08_top_candidates', {});
      await saveStageFile(testSessionId, testRunId, '04_normalized', {});
      await saveStageFile(testSessionId, testRunId, '10_results', {});

      const stages = await listStageFiles(testSessionId, testRunId);

      expect(stages[0]).toBe('04_normalized');
      expect(stages[1]).toBe('08_top_candidates');
      expect(stages[2]).toBe('10_results');
    });

    it('returns empty array for non-existent run', async () => {
      const stages = await listStageFiles(testSessionId, 'nonexistent');
      expect(stages).toEqual([]);
    });
  });
});
