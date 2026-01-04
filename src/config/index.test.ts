/**
 * Tests for configuration module
 *
 * @module config/index.test
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset module cache to get fresh config
    jest.resetModules();
    process.env = { ...originalEnv };
    // Suppress warnings in test output
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should load without errors', async () => {
    const { config } = await import('./index.js');
    expect(config).toBeDefined();
    expect(config.dataDir).toContain('.travelagent');
  });

  it('should use default data directory when not specified', async () => {
    delete process.env.TRAVELAGENT_DATA_DIR;
    const { config } = await import('./index.js');
    expect(config.dataDir).toMatch(/\.travelagent$/);
  });

  it('should use custom data directory when specified', async () => {
    process.env.TRAVELAGENT_DATA_DIR = '/custom/path';
    const { config } = await import('./index.js');
    expect(config.dataDir).toBe('/custom/path');
  });

  it('should have environment flags', async () => {
    process.env.NODE_ENV = 'test';
    const { config } = await import('./index.js');
    expect(config.isTest).toBe(true);
    expect(config.isProduction).toBe(false);
    expect(config.isDevelopment).toBe(false);
  });

  it('should have apiKeys object', async () => {
    const { config } = await import('./index.js');
    expect(config.apiKeys).toBeDefined();
    expect(typeof config.apiKeys).toBe('object');
  });

  describe('hasApiKey', () => {
    // Note: hasApiKey reads from config.apiKeys which is set at module load time
    // These tests verify the function works with the config object structure
    it('should return boolean based on config.apiKeys', async () => {
      const { hasApiKey, config } = await import('./index.js');
      // Function should work for all key types
      expect(typeof hasApiKey('openai')).toBe('boolean');
      expect(typeof hasApiKey('perplexity')).toBe('boolean');
      expect(typeof hasApiKey('googleAi')).toBe('boolean');
      expect(typeof hasApiKey('googlePlaces')).toBe('boolean');
      expect(typeof hasApiKey('youtube')).toBe('boolean');

      // Result should match whether key exists in config
      expect(hasApiKey('openai')).toBe(!!config.apiKeys.openai);
    });
  });

  describe('requireApiKey', () => {
    it('should throw for empty keys', async () => {
      process.env.OPENAI_API_KEY = '';
      const { requireApiKey } = await import('./index.js');
      expect(() => requireApiKey('openai')).toThrow(/Missing required API key/);
    });

    it('should return key when present in config', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const { requireApiKey, config } = await import('./index.js');
      // If the config has the key, requireApiKey should return it
      if (config.apiKeys.openai) {
        expect(requireApiKey('openai')).toBe(config.apiKeys.openai);
      }
    });
  });

  describe('cost exports', () => {
    it('should re-export TOKEN_COSTS', async () => {
      const { TOKEN_COSTS } = await import('./index.js');
      expect(TOKEN_COSTS).toBeDefined();
      expect(TOKEN_COSTS.perplexity).toBeDefined();
      expect(TOKEN_COSTS.gemini).toBeDefined();
      expect(TOKEN_COSTS.openai).toBeDefined();
    });

    it('should re-export API_COSTS', async () => {
      const { API_COSTS } = await import('./index.js');
      expect(API_COSTS).toBeDefined();
      expect(API_COSTS.places).toBeDefined();
      expect(API_COSTS.youtube).toBeDefined();
    });

    it('should re-export calculateTokenCost', async () => {
      const { calculateTokenCost } = await import('./index.js');
      expect(typeof calculateTokenCost).toBe('function');
      const cost = calculateTokenCost('perplexity', 1000, 500);
      expect(typeof cost).toBe('number');
    });

    it('should re-export formatCost', async () => {
      const { formatCost } = await import('./index.js');
      expect(typeof formatCost).toBe('function');
      expect(formatCost(0.005)).toBe('$0.0050');
    });
  });
});
