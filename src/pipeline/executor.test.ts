import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  PipelineExecutor,
  createPipelineExecutor,
  type ExecutorCallbacks,
} from './executor.js';
import type { Stage, StageContext, StageResult, StageNumber, StageName } from './types.js';
import { createRunDir } from '../storage/runs.js';
import { saveStageFile } from '../storage/stages.js';
import type { RunConfig } from '../schemas/run-config.js';

describe('PipelineExecutor', () => {
  let tempDir: string;
  const originalEnv = process.env.TRAVELAGENT_DATA_DIR;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'executor-test-'));
    process.env.TRAVELAGENT_DATA_DIR = tempDir;
  });

  afterEach(async () => {
    process.env.TRAVELAGENT_DATA_DIR = originalEnv;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const testSessionId = '20260107-test-session';
  const testRunId = '20260107-143512-full';
  const sourceRunId = '20260107-100000-source';

  // Helper to create mock stage
  const createMockStage = (
    number: StageNumber,
    name: StageName,
    outputData: unknown = { result: `stage-${number}-output` },
    shouldFail = false
  ): Stage => {
    const stageId = `${number.toString().padStart(2, '0')}_${name}`;

    return {
      id: stageId,
      name,
      number,
      execute: async (context: StageContext, _input: unknown): Promise<StageResult<unknown>> => {
        if (shouldFail) {
          throw new Error(`Stage ${number} failed intentionally`);
        }
        return {
          data: outputData,
          metadata: {
            stageId,
            stageNumber: number,
            stageName: name,
            schemaVersion: 1,
            sessionId: context.sessionId,
            runId: context.runId,
            createdAt: new Date().toISOString(),
          },
          timing: {
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            durationMs: 10,
          },
        };
      },
    };
  };

  // Stage names for all 11 stages (canonical names matching PRD Section 11.2)
  const stageNames: StageName[] = [
    'enhancement',
    'intake',
    'router_plan',
    'worker_outputs',
    'candidates_normalized',
    'candidates_deduped',
    'candidates_ranked',
    'candidates_validated',
    'top_candidates',
    'aggregator_output',
    'results',
  ];

  // Helper to create all 11 stages
  const createAllStages = (failAtStage?: number): Stage[] => {
    return stageNames.map((name, index) =>
      createMockStage(index as StageNumber, name, { result: `stage-${index}` }, failAtStage === index)
    );
  };

  // Mock context
  const createMockContext = (): StageContext => ({
    sessionId: testSessionId,
    runId: testRunId,
    config: {
      schemaVersion: 1,
      runId: testRunId,
      sessionId: testSessionId,
      startedAt: new Date().toISOString(),
      status: 'running',
      mode: 'full',
      models: {
        enhancement: 'test-model',
        router: 'test-model',
        normalizer: 'test-model',
        aggregator: 'test-model',
        validator: 'test-model',
      },
      promptVersions: {
        enhancement: 'v1',
        router: 'v1',
        aggregator: 'v1',
        youtubeExtraction: 'v1',
        validation: 'v1',
      },
      limits: {
        maxCandidatesPerWorker: 20,
        maxTopCandidates: 50,
        maxValidations: 10,
        workerTimeout: 30000,
      },
      flags: {
        skipEnhancement: false,
        skipValidation: false,
        skipYoutube: false,
      },
    } as RunConfig,
    costTracker: {
      addTokenUsage: jest.fn(),
      addApiCalls: jest.fn(),
      getTotal: () => ({ tokens: { input: 0, output: 0 }, estimatedCost: 0 }),
    },
    dataDir: tempDir,
  });

  describe('registerStage', () => {
    it('should register a stage', () => {
      const executor = new PipelineExecutor();
      const stage = createMockStage(0, 'enhancement');

      executor.registerStage(stage);

      expect(executor.getStage(0)).toBe(stage);
    });

    it('should throw for invalid stage number', () => {
      const executor = new PipelineExecutor();
      const invalidStage = {
        id: '11_invalid',
        name: 'invalid' as StageName,
        number: 11 as StageNumber,
        execute: jest.fn() as Stage['execute'],
      };

      expect(() => executor.registerStage(invalidStage)).toThrow(
        'Invalid stage number 11'
      );
    });

    it('should throw for duplicate registration', () => {
      const executor = new PipelineExecutor();
      const stage1 = createMockStage(0, 'enhancement');
      const stage2 = createMockStage(0, 'enhancement');

      executor.registerStage(stage1);

      expect(() => executor.registerStage(stage2)).toThrow(
        'Stage 0 is already registered'
      );
    });
  });

  describe('registerStages', () => {
    it('should register multiple stages', () => {
      const executor = new PipelineExecutor();
      const stages = createAllStages();

      executor.registerStages(stages);

      expect(executor.isComplete()).toBe(true);
    });
  });

  describe('isComplete', () => {
    it('should return false when stages are missing', () => {
      const executor = new PipelineExecutor();
      executor.registerStage(createMockStage(0, 'enhancement'));

      expect(executor.isComplete()).toBe(false);
    });

    it('should return true when all stages registered', () => {
      const executor = new PipelineExecutor();
      executor.registerStages(createAllStages());

      expect(executor.isComplete()).toBe(true);
    });
  });

  describe('getMissingStages', () => {
    it('should return all stages when empty', () => {
      const executor = new PipelineExecutor();

      const missing = executor.getMissingStages();

      expect(missing).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('should return empty when complete', () => {
      const executor = new PipelineExecutor();
      executor.registerStages(createAllStages());

      expect(executor.getMissingStages()).toEqual([]);
    });

    it('should return only missing stages', () => {
      const executor = new PipelineExecutor();
      executor.registerStage(createMockStage(0, 'enhancement'));
      executor.registerStage(createMockStage(5, 'candidates_deduped'));

      const missing = executor.getMissingStages();

      expect(missing).toContain(1);
      expect(missing).toContain(4);
      expect(missing).not.toContain(0);
      expect(missing).not.toContain(5);
    });
  });

  describe('execute', () => {
    it('should execute all stages in order', async () => {
      const executor = new PipelineExecutor();
      const stages = createAllStages();
      executor.registerStages(stages);

      await createRunDir(testSessionId, testRunId);
      const context = createMockContext();

      const result = await executor.execute(context);

      expect(result.success).toBe(true);
      expect(result.stagesExecuted).toHaveLength(11);
      expect(result.stagesSkipped).toHaveLength(0);
      expect(result.finalStage).toBe('10_results');
      expect(result.errors).toHaveLength(0);

      // Verify stages were executed in order by checking stagesExecuted array
      expect(result.stagesExecuted).toEqual([
        '00_enhancement', '01_intake', '02_router_plan', '03_worker_outputs',
        '04_candidates_normalized', '05_candidates_deduped', '06_candidates_ranked', '07_candidates_validated',
        '08_top_candidates', '09_aggregator_output', '10_results'
      ]);
    });

    it('should stop after stopAfterStage', async () => {
      const executor = new PipelineExecutor();
      executor.registerStages(createAllStages());

      await createRunDir(testSessionId, testRunId);
      const context = createMockContext();

      const result = await executor.execute(context, { stopAfterStage: 5 });

      expect(result.success).toBe(true);
      expect(result.stagesExecuted).toHaveLength(6); // Stages 0-5
      expect(result.finalStage).toBe('05_candidates_deduped');
    });

    it('should respect dryRun option', async () => {
      const executor = new PipelineExecutor();
      const stages = createAllStages();
      executor.registerStages(stages);

      const context = createMockContext();
      const result = await executor.execute(context, { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.stagesExecuted).toHaveLength(11);

      // In dry run, stages should not actually be executed (no file writes)
      // But our mock tracks calls regardless - the important thing is no checkpoints
    });

    it('should stop on stage error', async () => {
      const executor = new PipelineExecutor();
      const stages = createAllStages(5); // Fail at stage 5
      executor.registerStages(stages);

      await createRunDir(testSessionId, testRunId);
      const context = createMockContext();

      const result = await executor.execute(context);

      expect(result.success).toBe(false);
      expect(result.stagesExecuted).toHaveLength(5); // Stages 0-4 completed
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].stageId).toBe('05_candidates_deduped');
      expect(result.errors[0].error).toContain('Stage 5 failed intentionally');
    });

    it('should throw if stage not registered', async () => {
      const executor = new PipelineExecutor();
      // Only register stage 0
      executor.registerStage(createMockStage(0, 'enhancement'));

      const context = createMockContext();

      await expect(executor.execute(context)).rejects.toThrow(
        'Stage 1 (01_intake) not registered'
      );
    });

    it('should call lifecycle callbacks', async () => {
      const executor = new PipelineExecutor();
      executor.registerStages(createAllStages());

      const callbacks: ExecutorCallbacks = {
        onStageStart: jest.fn(),
        onStageComplete: jest.fn(),
        onStageError: jest.fn(),
      };
      executor.setCallbacks(callbacks);

      await createRunDir(testSessionId, testRunId);
      const context = createMockContext();

      await executor.execute(context);

      expect(callbacks.onStageStart).toHaveBeenCalledTimes(11);
      expect(callbacks.onStageComplete).toHaveBeenCalledTimes(11);
      expect(callbacks.onStageError).not.toHaveBeenCalled();
    });

    it('should track timing per stage', async () => {
      const executor = new PipelineExecutor();
      executor.registerStages(createAllStages());

      await createRunDir(testSessionId, testRunId);
      const context = createMockContext();

      const result = await executor.execute(context);

      expect(result.timing.perStage).toBeDefined();
      expect(Object.keys(result.timing.perStage)).toHaveLength(11);
      expect(result.timing.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should include degradedStages in result (empty when no failures)', async () => {
      const executor = new PipelineExecutor();
      executor.registerStages(createAllStages());

      await createRunDir(testSessionId, testRunId);
      const context = createMockContext();

      const result = await executor.execute(context);

      expect(result.degradedStages).toBeDefined();
      expect(result.degradedStages).toHaveLength(0);
    });
  });

  describe('continueOnError (graceful degradation)', () => {
    it('should continue execution when stage fails with continueOnError=true', async () => {
      const executor = new PipelineExecutor();
      const stages = createAllStages(5); // Fail at stage 5
      executor.registerStages(stages);

      await createRunDir(testSessionId, testRunId);
      const context = createMockContext();

      const result = await executor.execute(context, { continueOnError: true });

      // Pipeline should complete despite stage 5 failing
      expect(result.success).toBe(true);
      expect(result.stagesExecuted).toHaveLength(11); // All stages attempted
      expect(result.finalStage).toBe('10_results');
      expect(result.degradedStages).toContain('05_candidates_deduped');
      expect(result.degradedStages).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].continued).toBe(true);
    });

    it('should mark error as continued=true with continueOnError', async () => {
      const executor = new PipelineExecutor();
      const stages = createAllStages(3); // Fail at stage 3
      executor.registerStages(stages);

      await createRunDir(testSessionId, testRunId);
      const context = createMockContext();

      const result = await executor.execute(context, { continueOnError: true });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].stageId).toBe('03_worker_outputs');
      expect(result.errors[0].continued).toBe(true);
    });

    it('should call onStageError callback even when continuing', async () => {
      const executor = new PipelineExecutor();
      const stages = createAllStages(5); // Fail at stage 5
      executor.registerStages(stages);

      const callbacks: ExecutorCallbacks = {
        onStageStart: jest.fn(),
        onStageComplete: jest.fn(),
        onStageError: jest.fn(),
      };
      executor.setCallbacks(callbacks);

      await createRunDir(testSessionId, testRunId);
      const context = createMockContext();

      await executor.execute(context, { continueOnError: true });

      expect(callbacks.onStageError).toHaveBeenCalledTimes(1);
      expect(callbacks.onStageComplete).toHaveBeenCalledTimes(10); // 10 successful stages
    });

    it('should handle multiple stage failures with continueOnError', async () => {
      const executor = new PipelineExecutor();

      // Create stages where 3 and 7 fail
      const stages = stageNames.map((name, index) => {
        const shouldFail = index === 3 || index === 7;
        return createMockStage(index as StageNumber, name, { result: `stage-${index}` }, shouldFail);
      });
      executor.registerStages(stages);

      await createRunDir(testSessionId, testRunId);
      const context = createMockContext();

      const result = await executor.execute(context, { continueOnError: true });

      expect(result.success).toBe(true);
      expect(result.stagesExecuted).toHaveLength(11);
      expect(result.degradedStages).toHaveLength(2);
      expect(result.degradedStages).toContain('03_worker_outputs');
      expect(result.degradedStages).toContain('07_candidates_validated');
      expect(result.errors).toHaveLength(2);
    });

    it('should track timing for failed stages', async () => {
      const executor = new PipelineExecutor();
      const stages = createAllStages(5); // Fail at stage 5
      executor.registerStages(stages);

      await createRunDir(testSessionId, testRunId);
      const context = createMockContext();

      const result = await executor.execute(context, { continueOnError: true });

      // Failed stage should have timing recorded
      expect(result.timing.perStage['05_candidates_deduped']).toBeDefined();
      expect(result.timing.perStage['05_candidates_deduped']).toBeGreaterThanOrEqual(0);
    });

    it('should default continueOnError to false (backward compatible)', async () => {
      const executor = new PipelineExecutor();
      const stages = createAllStages(5); // Fail at stage 5
      executor.registerStages(stages);

      await createRunDir(testSessionId, testRunId);
      const context = createMockContext();

      // Without continueOnError option, should stop on error
      const result = await executor.execute(context);

      expect(result.success).toBe(false);
      expect(result.stagesExecuted).toHaveLength(5); // Stages 0-4 only
      expect(result.degradedStages).toHaveLength(0);
      expect(result.errors[0].continued).toBe(false);
    });

    it('should work with stopAfterStage and continueOnError together', async () => {
      const executor = new PipelineExecutor();
      const stages = createAllStages(3); // Fail at stage 3
      executor.registerStages(stages);

      await createRunDir(testSessionId, testRunId);
      const context = createMockContext();

      const result = await executor.execute(context, {
        continueOnError: true,
        stopAfterStage: 6,
      });

      expect(result.success).toBe(true);
      expect(result.stagesExecuted).toHaveLength(7); // Stages 0-6
      expect(result.finalStage).toBe('06_candidates_ranked');
      expect(result.degradedStages).toContain('03_worker_outputs');
    });
  });

  describe('executeFromStage', () => {
    const createSourceRunData = async () => {
      // Create source run with stage 7 data
      await createRunDir(testSessionId, sourceRunId);

      const stageData = {
        _meta: {
          stageId: '07_candidates_validated',
          stageNumber: 7,
          stageName: 'candidates_validated',
          schemaVersion: 1,
          sessionId: testSessionId,
          runId: sourceRunId,
          createdAt: new Date().toISOString(),
        },
        data: {
          candidates: [{ id: 'c1', name: 'Test Candidate' }],
        },
      };

      await saveStageFile(
        testSessionId,
        sourceRunId,
        '07_candidates_validated',
        stageData
      );
    };

    it('should skip upstream stages', async () => {
      const executor = new PipelineExecutor();
      const stages = createAllStages();
      executor.registerStages(stages);

      await createSourceRunData();
      await createRunDir(testSessionId, testRunId);
      const context = createMockContext();

      const callbacks: ExecutorCallbacks = {
        onStageSkip: jest.fn(),
      };
      executor.setCallbacks(callbacks);

      const result = await executor.executeFromStage(context, 8, sourceRunId);

      expect(result.success).toBe(true);
      expect(result.stagesSkipped).toHaveLength(8); // Stages 0-7
      expect(result.stagesSkipped[0]).toBe('00_enhancement');
      expect(result.stagesSkipped[7]).toBe('07_candidates_validated');
      expect(result.stagesExecuted).toHaveLength(3); // Stages 8-10
      expect(callbacks.onStageSkip).toHaveBeenCalledTimes(8);
    });

    it('should load input from source run', async () => {
      const executor = new PipelineExecutor();
      const stages = createAllStages();
      executor.registerStages(stages);

      await createSourceRunData();
      await createRunDir(testSessionId, testRunId);
      const context = createMockContext();

      const result = await executor.executeFromStage(context, 8, sourceRunId);

      expect(result.success).toBe(true);

      // Verify that execution succeeded and stages 8-10 ran
      // The input would have been loaded from stage 7 of the source run
      expect(result.stagesExecuted).toContain('08_top_candidates');
      expect(result.stagesExecuted).toContain('09_aggregator_output');
      expect(result.stagesExecuted).toContain('10_results');
      expect(result.stagesExecuted).toHaveLength(3);
    });

    it('should execute from stage 0 as full run', async () => {
      const executor = new PipelineExecutor();
      executor.registerStages(createAllStages());

      await createRunDir(testSessionId, testRunId);
      const context = createMockContext();

      const result = await executor.executeFromStage(context, 0, sourceRunId);

      expect(result.stagesSkipped).toHaveLength(0);
      expect(result.stagesExecuted).toHaveLength(11);
    });

    it('should throw for invalid stage number', async () => {
      const executor = new PipelineExecutor();

      const context = createMockContext();

      await expect(
        executor.executeFromStage(context, 11, sourceRunId)
      ).rejects.toThrow('Invalid stage number: 11');
    });

    it('should throw if source run data not found', async () => {
      const executor = new PipelineExecutor();
      executor.registerStages(createAllStages());

      const context = createMockContext();

      await expect(
        executor.executeFromStage(context, 8, 'nonexistent-run')
      ).rejects.toThrow(/Failed to load input stage/);
    });

    it('should support stopAfterStage in resume mode', async () => {
      const executor = new PipelineExecutor();
      executor.registerStages(createAllStages());

      await createSourceRunData();
      await createRunDir(testSessionId, testRunId);
      const context = createMockContext();

      const result = await executor.executeFromStage(context, 8, sourceRunId, {
        stopAfterStage: 9,
      });

      expect(result.stagesExecuted).toHaveLength(2); // Stages 8-9 only
      expect(result.finalStage).toBe('09_aggregator_output');
    });
  });

  describe('clear', () => {
    it('should remove all registered stages', () => {
      const executor = new PipelineExecutor();
      executor.registerStages(createAllStages());

      expect(executor.isComplete()).toBe(true);

      executor.clear();

      expect(executor.isComplete()).toBe(false);
      expect(executor.getMissingStages()).toHaveLength(11);
    });
  });

  describe('createPipelineExecutor', () => {
    it('should create a new executor instance', () => {
      const executor = createPipelineExecutor();

      expect(executor).toBeInstanceOf(PipelineExecutor);
      expect(executor.isComplete()).toBe(false);
    });
  });

  describe('validateStagesForExecution', () => {
    it('should return missing stages in range', () => {
      const executor = new PipelineExecutor();
      executor.registerStage(createMockStage(8, 'top_candidates'));
      executor.registerStage(createMockStage(10, 'results'));

      const missing = executor.validateStagesForExecution(8, 10);

      expect(missing).toEqual([9]);
    });

    it('should return empty when all in range registered', () => {
      const executor = new PipelineExecutor();
      executor.registerStage(createMockStage(8, 'top_candidates'));
      executor.registerStage(createMockStage(9, 'aggregator_output'));
      executor.registerStage(createMockStage(10, 'results'));

      const missing = executor.validateStagesForExecution(8, 10);

      expect(missing).toEqual([]);
    });
  });

  describe('getAllStages', () => {
    it('should return stages sorted by number', () => {
      const executor = new PipelineExecutor();
      executor.registerStage(createMockStage(5, 'candidates_deduped'));
      executor.registerStage(createMockStage(2, 'router_plan'));
      executor.registerStage(createMockStage(8, 'top_candidates'));

      const stages = executor.getAllStages();

      expect(stages[0].number).toBe(2);
      expect(stages[1].number).toBe(5);
      expect(stages[2].number).toBe(8);
    });
  });
});
