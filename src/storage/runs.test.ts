import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { RunConfig } from '../schemas/index.js';
import { DEFAULT_LIMITS, DEFAULT_FLAGS } from '../schemas/index.js';
import {
  DEFAULT_MODELS,
  DEFAULT_PROMPT_VERSIONS,
} from '../schemas/run-config.js';
import {
  createRunDir,
  saveRunConfig,
  loadRunConfig,
  listRuns,
  getLatestRunId,
  updateLatestSymlink,
} from './runs.js';
import { getRunDir, getRunsDir } from './paths.js';

describe('runs storage', () => {
  let tempDir: string;
  const originalEnv = process.env.TRAVELAGENT_DATA_DIR;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runs-test-'));
    process.env.TRAVELAGENT_DATA_DIR = tempDir;
  });

  afterEach(async () => {
    process.env.TRAVELAGENT_DATA_DIR = originalEnv;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const testSessionId = '20260102-test-session';

  function createTestRunConfig(overrides?: Partial<RunConfig>): RunConfig {
    return {
      schemaVersion: 1,
      runId: '20260102-143512-full',
      sessionId: testSessionId,
      startedAt: new Date().toISOString(),
      status: 'running',
      mode: 'full',
      models: DEFAULT_MODELS,
      promptVersions: DEFAULT_PROMPT_VERSIONS,
      limits: DEFAULT_LIMITS,
      flags: DEFAULT_FLAGS,
      ...overrides,
    };
  }

  describe('createRunDir', () => {
    it('creates directory structure', async () => {
      const runId = '20260102-143512-full';
      await createRunDir(testSessionId, runId);

      const runDir = getRunDir(testSessionId, runId);
      const stat = await fs.stat(runDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('is idempotent', async () => {
      const runId = '20260102-143512-full';
      await createRunDir(testSessionId, runId);
      await createRunDir(testSessionId, runId);

      const runDir = getRunDir(testSessionId, runId);
      const stat = await fs.stat(runDir);
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe('saveRunConfig', () => {
    it('creates run.json file', async () => {
      const runConfig = createTestRunConfig();
      await createRunDir(testSessionId, runConfig.runId);
      await saveRunConfig(testSessionId, runConfig);

      const filePath = path.join(
        getRunDir(testSessionId, runConfig.runId),
        'run.json'
      );
      const content = await fs.readFile(filePath, 'utf-8');
      const saved = JSON.parse(content);

      expect(saved.runId).toBe(runConfig.runId);
      expect(saved.sessionId).toBe(runConfig.sessionId);
    });

    it('validates config', async () => {
      const invalidConfig = { runId: 'test' } as RunConfig;
      await expect(saveRunConfig(testSessionId, invalidConfig)).rejects.toThrow();
    });
  });

  describe('loadRunConfig', () => {
    it('returns valid config', async () => {
      const runConfig = createTestRunConfig();
      await createRunDir(testSessionId, runConfig.runId);
      await saveRunConfig(testSessionId, runConfig);

      const loaded = await loadRunConfig(testSessionId, runConfig.runId);

      expect(loaded.runId).toBe(runConfig.runId);
      expect(loaded.status).toBe(runConfig.status);
    });

    it('throws for non-existent run', async () => {
      await expect(
        loadRunConfig(testSessionId, 'nonexistent')
      ).rejects.toThrow(/Run not found: nonexistent in session .* \(path: /);
    });
  });

  describe('listRuns', () => {
    it('returns run IDs', async () => {
      const run1 = '20260102-100000-full';
      const run2 = '20260102-110000-full';

      await createRunDir(testSessionId, run1);
      await createRunDir(testSessionId, run2);

      const runs = await listRuns(testSessionId);

      expect(runs).toContain(run1);
      expect(runs).toContain(run2);
    });

    it('excludes latest symlink', async () => {
      const runId = '20260102-143512-full';
      await createRunDir(testSessionId, runId);
      await updateLatestSymlink(testSessionId, runId);

      const runs = await listRuns(testSessionId);

      expect(runs).toContain(runId);
      expect(runs).not.toContain('latest');
    });

    it('returns empty array for non-existent session', async () => {
      const runs = await listRuns('nonexistent');
      expect(runs).toEqual([]);
    });

    it('sorts by runId descending', async () => {
      const run1 = '20260102-100000-full';
      const run2 = '20260102-110000-full';
      const run3 = '20260102-090000-full';

      await createRunDir(testSessionId, run1);
      await createRunDir(testSessionId, run2);
      await createRunDir(testSessionId, run3);

      const runs = await listRuns(testSessionId);

      expect(runs[0]).toBe(run2);
      expect(runs[1]).toBe(run1);
      expect(runs[2]).toBe(run3);
    });
  });

  describe('getLatestRunId', () => {
    it('returns runId when symlink exists', async () => {
      const runId = '20260102-143512-full';
      await createRunDir(testSessionId, runId);
      await updateLatestSymlink(testSessionId, runId);

      const latestId = await getLatestRunId(testSessionId);
      expect(latestId).toBe(runId);
    });

    it('returns null when symlink does not exist', async () => {
      const latestId = await getLatestRunId(testSessionId);
      expect(latestId).toBeNull();
    });
  });

  describe('updateLatestSymlink', () => {
    it('creates symlink', async () => {
      const runId = '20260102-143512-full';
      await createRunDir(testSessionId, runId);
      await updateLatestSymlink(testSessionId, runId);

      const linkPath = path.join(getRunsDir(testSessionId), 'latest');
      const target = await fs.readlink(linkPath);
      expect(target).toBe(runId);
    });

    it('updates existing symlink', async () => {
      const run1 = '20260102-100000-full';
      const run2 = '20260102-110000-full';

      await createRunDir(testSessionId, run1);
      await createRunDir(testSessionId, run2);
      await updateLatestSymlink(testSessionId, run1);
      await updateLatestSymlink(testSessionId, run2);

      const latestId = await getLatestRunId(testSessionId);
      expect(latestId).toBe(run2);
    });

    it('throws error for non-existent run directory', async () => {
      const runId = '20260102-nonexistent-run';
      // Do not create the run directory

      await expect(updateLatestSymlink(testSessionId, runId)).rejects.toThrow(
        'Run directory does not exist: 20260102-nonexistent-run'
      );
    });

    it('throws error when target is not a directory', async () => {
      const runId = '20260102-143512-full';
      const runDir = getRunDir(testSessionId, runId);

      // Create a file instead of a directory at the run path
      await fs.mkdir(path.dirname(runDir), { recursive: true });
      await fs.writeFile(runDir, 'not a directory');

      await expect(updateLatestSymlink(testSessionId, runId)).rejects.toThrow(
        'Target is not a directory: 20260102-143512-full'
      );
    });
  });
});
