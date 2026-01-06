import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  GlobalConfigSchema,
  DEFAULT_GLOBAL_CONFIG,
  saveGlobalConfig,
  loadGlobalConfig,
  type GlobalConfig,
} from './config.js';
import { getGlobalConfigPath } from './paths.js';

describe('config storage', () => {
  let tempDir: string;
  const originalEnv = process.env.TRAVELAGENT_DATA_DIR;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'config-test-'));
    process.env.TRAVELAGENT_DATA_DIR = tempDir;
  });

  afterEach(async () => {
    process.env.TRAVELAGENT_DATA_DIR = originalEnv;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('GlobalConfigSchema', () => {
    it('validates valid config', () => {
      const config: GlobalConfig = {
        schemaVersion: 1,
        defaultEnhancementModel: 'gemini-3-flash',
        skipYoutubeByDefault: true,
      };

      const result = GlobalConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('applies default schemaVersion', () => {
      const config = {};
      const parsed = GlobalConfigSchema.parse(config);
      expect(parsed.schemaVersion).toBe(1);
    });

    it('allows optional fields', () => {
      const config = { schemaVersion: 1 };
      const parsed = GlobalConfigSchema.parse(config);

      expect(parsed.defaultEnhancementModel).toBeUndefined();
      expect(parsed.skipYoutubeByDefault).toBeUndefined();
    });
  });

  describe('DEFAULT_GLOBAL_CONFIG', () => {
    it('is valid', () => {
      const result = GlobalConfigSchema.safeParse(DEFAULT_GLOBAL_CONFIG);
      expect(result.success).toBe(true);
    });

    it('has schemaVersion 1', () => {
      expect(DEFAULT_GLOBAL_CONFIG.schemaVersion).toBe(1);
    });
  });

  describe('saveGlobalConfig', () => {
    it('creates config.json file', async () => {
      const config: GlobalConfig = {
        schemaVersion: 1,
        defaultEnhancementModel: 'gpt-4',
      };

      await saveGlobalConfig(config);

      const filePath = getGlobalConfigPath();
      const content = await fs.readFile(filePath, 'utf-8');
      const saved = JSON.parse(content);

      expect(saved.schemaVersion).toBe(1);
      expect(saved.defaultEnhancementModel).toBe('gpt-4');
    });

    it('validates config', async () => {
      const invalidConfig = { schemaVersion: -1 } as GlobalConfig;
      await expect(saveGlobalConfig(invalidConfig)).rejects.toThrow();
    });

    it('overwrites existing config', async () => {
      await saveGlobalConfig({ schemaVersion: 1, skipYoutubeByDefault: true });
      await saveGlobalConfig({ schemaVersion: 1, skipYoutubeByDefault: false });

      const loaded = await loadGlobalConfig();
      expect(loaded.skipYoutubeByDefault).toBe(false);
    });
  });

  describe('loadGlobalConfig', () => {
    it('returns saved config', async () => {
      const config: GlobalConfig = {
        schemaVersion: 1,
        defaultAggregatorModel: 'claude-3',
        skipEnhancementByDefault: true,
      };

      await saveGlobalConfig(config);
      const loaded = await loadGlobalConfig();

      expect(loaded.defaultAggregatorModel).toBe('claude-3');
      expect(loaded.skipEnhancementByDefault).toBe(true);
    });

    it('returns default when file does not exist', async () => {
      const loaded = await loadGlobalConfig();

      expect(loaded).toEqual(DEFAULT_GLOBAL_CONFIG);
    });

    it('throws for invalid config', async () => {
      const filePath = getGlobalConfigPath();
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, '{"schemaVersion": "invalid"}');

      await expect(loadGlobalConfig()).rejects.toThrow();
    });

    it('parses all config fields correctly', async () => {
      const config: GlobalConfig = {
        schemaVersion: 1,
        defaultEnhancementModel: 'gemini-3-flash',
        defaultAggregatorModel: 'gpt-4o',
        skipEnhancementByDefault: true,
        skipYoutubeByDefault: true,
        skipValidationByDefault: false,
      };

      await saveGlobalConfig(config);
      const loaded = await loadGlobalConfig();

      expect(loaded).toEqual(config);
    });
  });
});
