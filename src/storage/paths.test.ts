/**
 * Path Resolution Utilities Tests
 *
 * Comprehensive tests for the storage path utilities.
 * Tests cover environment variable handling, path generation,
 * and error cases.
 *
 * @module storage/paths.test
 */

import * as os from 'node:os';
import * as path from 'node:path';
import {
  getDataDir,
  getSessionsDir,
  getSessionDir,
  getRunsDir,
  getRunDir,
  getStageFilePath,
  getLatestRunSymlink,
  getSessionJsonPath,
  getTriageFilePath,
  getEnhancementFilePath,
  getRunConfigPath,
  getManifestPath,
  getGlobalConfigPath,
  getExportsDir,
  getResultsJsonPath,
  getResultsMdPath,
} from './paths.js';

describe('storage/paths', () => {
  // Store original env var to restore after tests
  const originalEnvVar = process.env.TRAVELAGENT_DATA_DIR;

  afterEach(() => {
    // Restore original env var after each test
    if (originalEnvVar === undefined) {
      delete process.env.TRAVELAGENT_DATA_DIR;
    } else {
      process.env.TRAVELAGENT_DATA_DIR = originalEnvVar;
    }
  });

  describe('getDataDir', () => {
    it('should return default path when env var is not set', () => {
      delete process.env.TRAVELAGENT_DATA_DIR;

      const result = getDataDir();

      expect(result).toBe(path.join(os.homedir(), '.travelagent'));
    });

    it('should use TRAVELAGENT_DATA_DIR env var when set', () => {
      process.env.TRAVELAGENT_DATA_DIR = '/custom/data/dir';

      const result = getDataDir();

      expect(result).toBe('/custom/data/dir');
    });

    it('should expand tilde in env var path', () => {
      process.env.TRAVELAGENT_DATA_DIR = '~/custom/travelagent';

      const result = getDataDir();

      expect(result).toBe(path.join(os.homedir(), 'custom/travelagent'));
    });

    it('should resolve relative paths in env var', () => {
      process.env.TRAVELAGENT_DATA_DIR = './data';

      const result = getDataDir();

      expect(result).toBe(path.resolve('./data'));
    });

    it('should handle empty env var as not set', () => {
      process.env.TRAVELAGENT_DATA_DIR = '';

      const result = getDataDir();

      // Empty string is falsy, so should return default
      expect(result).toBe(path.join(os.homedir(), '.travelagent'));
    });
  });

  describe('getSessionsDir', () => {
    it('should return sessions subdirectory of data dir', () => {
      delete process.env.TRAVELAGENT_DATA_DIR;

      const result = getSessionsDir();

      expect(result).toBe(path.join(os.homedir(), '.travelagent', 'sessions'));
    });

    it('should respect custom data dir', () => {
      process.env.TRAVELAGENT_DATA_DIR = '/custom/path';

      const result = getSessionsDir();

      expect(result).toBe('/custom/path/sessions');
    });
  });

  describe('getSessionDir', () => {
    beforeEach(() => {
      delete process.env.TRAVELAGENT_DATA_DIR;
    });

    it('should return correct path for valid session ID', () => {
      const result = getSessionDir('20260102-japan-food-temples');

      expect(result).toBe(
        path.join(os.homedir(), '.travelagent', 'sessions', '20260102-japan-food-temples')
      );
    });

    it('should throw error for empty session ID', () => {
      expect(() => getSessionDir('')).toThrow('sessionId is required');
    });

    it('should throw error for whitespace-only session ID', () => {
      expect(() => getSessionDir('   ')).toThrow('sessionId is required');
    });

    it('should handle session ID with special characters', () => {
      const result = getSessionDir('20260102-tokyo-trip-1');

      expect(result).toContain('20260102-tokyo-trip-1');
    });
  });

  describe('getRunsDir', () => {
    beforeEach(() => {
      delete process.env.TRAVELAGENT_DATA_DIR;
    });

    it('should return runs subdirectory of session dir', () => {
      const result = getRunsDir('20260102-japan-food-temples');

      expect(result).toBe(
        path.join(
          os.homedir(),
          '.travelagent',
          'sessions',
          '20260102-japan-food-temples',
          'runs'
        )
      );
    });
  });

  describe('getRunDir', () => {
    beforeEach(() => {
      delete process.env.TRAVELAGENT_DATA_DIR;
    });

    it('should return correct path for valid session and run IDs', () => {
      const result = getRunDir('20260102-japan-food-temples', '20260102-143512-full');

      expect(result).toBe(
        path.join(
          os.homedir(),
          '.travelagent',
          'sessions',
          '20260102-japan-food-temples',
          'runs',
          '20260102-143512-full'
        )
      );
    });

    it('should throw error for empty session ID', () => {
      expect(() => getRunDir('', '20260102-143512-full')).toThrow('sessionId is required');
    });

    it('should throw error for empty run ID', () => {
      expect(() => getRunDir('20260102-japan-food-temples', '')).toThrow('runId is required');
    });

    it('should throw error for whitespace-only session ID', () => {
      expect(() => getRunDir('   ', '20260102-143512-full')).toThrow('sessionId is required');
    });

    it('should throw error for whitespace-only run ID', () => {
      expect(() => getRunDir('20260102-japan-food-temples', '   ')).toThrow('runId is required');
    });

    it('should handle run ID with mode suffix', () => {
      const result = getRunDir('20260102-japan-food-temples', '20260102-143512-from-08');

      expect(result).toContain('20260102-143512-from-08');
    });
  });

  describe('getStageFilePath', () => {
    beforeEach(() => {
      delete process.env.TRAVELAGENT_DATA_DIR;
    });

    it('should return correct path for valid parameters', () => {
      const result = getStageFilePath(
        '20260102-japan-food-temples',
        '20260102-143512-full',
        '04_candidates_normalized'
      );

      expect(result).toBe(
        path.join(
          os.homedir(),
          '.travelagent',
          'sessions',
          '20260102-japan-food-temples',
          'runs',
          '20260102-143512-full',
          '04_candidates_normalized.json'
        )
      );
    });

    it('should add .json extension if not present', () => {
      const result = getStageFilePath(
        '20260102-japan-food-temples',
        '20260102-143512-full',
        '01_intake'
      );

      expect(result.endsWith('01_intake.json')).toBe(true);
    });

    it('should not double .json extension', () => {
      const result = getStageFilePath(
        '20260102-japan-food-temples',
        '20260102-143512-full',
        '01_intake.json'
      );

      expect(result.endsWith('01_intake.json')).toBe(true);
      expect(result.endsWith('.json.json')).toBe(false);
    });

    it('should throw error for empty session ID', () => {
      expect(() =>
        getStageFilePath('', '20260102-143512-full', '04_candidates_normalized')
      ).toThrow('sessionId is required');
    });

    it('should throw error for empty run ID', () => {
      expect(() =>
        getStageFilePath('20260102-japan-food-temples', '', '04_candidates_normalized')
      ).toThrow('runId is required');
    });

    it('should throw error for empty stage ID', () => {
      expect(() =>
        getStageFilePath('20260102-japan-food-temples', '20260102-143512-full', '')
      ).toThrow('stageId is required');
    });

    it('should handle all stage IDs from 00 to 10', () => {
      const stages = [
        '00_enhancement',
        '01_intake',
        '02_router',
        '03_workers',
        '04_candidates_normalized',
        '05_candidates_deduped',
        '06_candidates_ranked',
        '07_candidates_validated',
        '08_top_candidates',
        '09_aggregator',
        '10_results',
      ];

      stages.forEach((stageId) => {
        const result = getStageFilePath(
          '20260102-japan-food-temples',
          '20260102-143512-full',
          stageId
        );
        expect(result).toContain(stageId);
        expect(result.endsWith('.json')).toBe(true);
      });
    });
  });

  describe('getLatestRunSymlink', () => {
    beforeEach(() => {
      delete process.env.TRAVELAGENT_DATA_DIR;
    });

    it('should return correct symlink path', () => {
      const result = getLatestRunSymlink('20260102-japan-food-temples');

      expect(result).toBe(
        path.join(
          os.homedir(),
          '.travelagent',
          'sessions',
          '20260102-japan-food-temples',
          'runs',
          'latest'
        )
      );
    });

    it('should throw error for empty session ID', () => {
      expect(() => getLatestRunSymlink('')).toThrow('sessionId is required');
    });

    it('should throw error for whitespace-only session ID', () => {
      expect(() => getLatestRunSymlink('   ')).toThrow('sessionId is required');
    });
  });

  describe('Additional Path Helpers', () => {
    beforeEach(() => {
      delete process.env.TRAVELAGENT_DATA_DIR;
    });

    describe('getSessionJsonPath', () => {
      it('should return session.json path in session dir', () => {
        const result = getSessionJsonPath('20260102-japan-food-temples');

        expect(result.endsWith(
          path.join('20260102-japan-food-temples', 'session.json')
        )).toBe(true);
      });
    });

    describe('getTriageFilePath', () => {
      it('should return triage.json path in session dir', () => {
        const result = getTriageFilePath('20260102-japan-food-temples');

        expect(result.endsWith(
          path.join('20260102-japan-food-temples', 'triage.json')
        )).toBe(true);
      });
    });

    describe('getEnhancementFilePath', () => {
      it('should return 00_enhancement.json path in session dir', () => {
        const result = getEnhancementFilePath('20260102-japan-food-temples');

        expect(result.endsWith(
          path.join('20260102-japan-food-temples', '00_enhancement.json')
        )).toBe(true);
      });
    });

    describe('getRunConfigPath', () => {
      it('should return run.json path in run dir', () => {
        const result = getRunConfigPath('20260102-japan-food-temples', '20260102-143512-full');

        expect(result.endsWith(
          path.join('20260102-143512-full', 'run.json')
        )).toBe(true);
      });
    });

    describe('getManifestPath', () => {
      it('should return manifest.json path in run dir', () => {
        const result = getManifestPath('20260102-japan-food-temples', '20260102-143512-full');

        expect(result.endsWith(
          path.join('20260102-143512-full', 'manifest.json')
        )).toBe(true);
      });
    });

    describe('getGlobalConfigPath', () => {
      it('should return config.json path in data dir', () => {
        const result = getGlobalConfigPath();

        expect(result).toBe(path.join(os.homedir(), '.travelagent', 'config.json'));
      });

      it('should respect custom data dir', () => {
        process.env.TRAVELAGENT_DATA_DIR = '/custom/path';

        const result = getGlobalConfigPath();

        expect(result).toBe('/custom/path/config.json');
      });
    });

    describe('getExportsDir', () => {
      it('should return exports subdirectory of run dir', () => {
        const result = getExportsDir('20260102-japan-food-temples', '20260102-143512-full');

        expect(result.endsWith(
          path.join('20260102-143512-full', 'exports')
        )).toBe(true);
      });
    });

    describe('getResultsJsonPath', () => {
      it('should return results.json path in exports dir', () => {
        const result = getResultsJsonPath('20260102-japan-food-temples', '20260102-143512-full');

        expect(result.endsWith(
          path.join('exports', 'results.json')
        )).toBe(true);
      });
    });

    describe('getResultsMdPath', () => {
      it('should return results.md path in exports dir', () => {
        const result = getResultsMdPath('20260102-japan-food-temples', '20260102-143512-full');

        expect(result.endsWith(
          path.join('exports', 'results.md')
        )).toBe(true);
      });
    });
  });

  describe('Path Consistency', () => {
    beforeEach(() => {
      delete process.env.TRAVELAGENT_DATA_DIR;
    });

    it('should maintain consistent hierarchy across functions', () => {
      const sessionId = '20260102-japan-food-temples';
      const runId = '20260102-143512-full';

      const dataDir = getDataDir();
      const sessionsDir = getSessionsDir();
      const sessionDir = getSessionDir(sessionId);
      const runsDir = getRunsDir(sessionId);
      const runDir = getRunDir(sessionId, runId);

      // Verify hierarchy
      expect(sessionsDir).toBe(path.join(dataDir, 'sessions'));
      expect(sessionDir).toBe(path.join(sessionsDir, sessionId));
      expect(runsDir).toBe(path.join(sessionDir, 'runs'));
      expect(runDir).toBe(path.join(runsDir, runId));
    });

    it('should all paths be absolute', () => {
      const sessionId = '20260102-japan-food-temples';
      const runId = '20260102-143512-full';

      const paths = [
        getDataDir(),
        getSessionsDir(),
        getSessionDir(sessionId),
        getRunsDir(sessionId),
        getRunDir(sessionId, runId),
        getStageFilePath(sessionId, runId, '01_intake'),
        getLatestRunSymlink(sessionId),
        getSessionJsonPath(sessionId),
        getTriageFilePath(sessionId),
        getEnhancementFilePath(sessionId),
        getRunConfigPath(sessionId, runId),
        getManifestPath(sessionId, runId),
        getGlobalConfigPath(),
        getExportsDir(sessionId, runId),
        getResultsJsonPath(sessionId, runId),
        getResultsMdPath(sessionId, runId),
      ];

      paths.forEach((p) => {
        expect(path.isAbsolute(p)).toBe(true);
      });
    });
  });
});
