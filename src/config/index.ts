/**
 * Configuration Module
 *
 * Loads and validates environment variables for the Travel Discovery Orchestrator.
 * Uses Zod for runtime validation with sensible defaults.
 *
 * @module config
 */

import 'dotenv/config';
import { z } from 'zod';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Environment schema with optional values and defaults
const envSchema = z.object({
  // API Keys (required for full functionality, but allow starting without them)
  OPENAI_API_KEY: z.string().optional(),
  PERPLEXITY_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  YOUTUBE_API_KEY: z.string().optional(),

  // Data directory
  TRAVELAGENT_DATA_DIR: z.string().optional(),

  // Model overrides
  ENHANCEMENT_MODEL: z.string().optional(),
  ROUTER_MODEL: z.string().optional(),
  NORMALIZER_MODEL: z.string().optional(),
  AGGREGATOR_MODEL: z.string().optional(),
  LONG_CONTEXT_MODEL: z.string().optional(),
  YOUTUBE_MODEL: z.string().optional(),

  // Runtime options
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

type Env = z.infer<typeof envSchema>;

// Parse environment
const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  console.error('Invalid environment variables:');
  console.error(parseResult.error.format());
  process.exit(1);
}

const env: Env = parseResult.data;

// Warn about missing API keys (but don't fail)
const requiredKeys = [
  'OPENAI_API_KEY',
  'PERPLEXITY_API_KEY',
  'GOOGLE_AI_API_KEY',
  'GOOGLE_PLACES_API_KEY',
  'YOUTUBE_API_KEY',
] as const;

const missingKeys = requiredKeys.filter((key) => !env[key]);
if (missingKeys.length > 0 && env.NODE_ENV !== 'test') {
  console.warn('Warning: Missing API keys:', missingKeys.join(', '));
  console.warn('  Some features will be unavailable. See .env.example for setup.');
}

/**
 * Application configuration singleton
 */
export const config = {
  // Environment
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isDevelopment: env.NODE_ENV === 'development',
  isTest: env.NODE_ENV === 'test',

  // API Keys
  apiKeys: {
    openai: env.OPENAI_API_KEY,
    perplexity: env.PERPLEXITY_API_KEY,
    googleAi: env.GOOGLE_AI_API_KEY,
    googlePlaces: env.GOOGLE_PLACES_API_KEY,
    youtube: env.YOUTUBE_API_KEY,
  },

  // Data directory
  dataDir: env.TRAVELAGENT_DATA_DIR ?? join(homedir(), '.travelagent'),

  // Model configuration overrides (defaults defined in ./models.ts)
  models: {
    enhancement: env.ENHANCEMENT_MODEL,
    router: env.ROUTER_MODEL,
    normalizer: env.NORMALIZER_MODEL,
    aggregator: env.AGGREGATOR_MODEL,
    longContext: env.LONG_CONTEXT_MODEL,
    youtube: env.YOUTUBE_MODEL,
  },
} as const;

/**
 * Check if a specific API is configured
 */
export function hasApiKey(api: keyof typeof config.apiKeys): boolean {
  return !!config.apiKeys[api];
}

/**
 * Get an API key or throw if not configured
 */
export function requireApiKey(api: keyof typeof config.apiKeys): string {
  const key = config.apiKeys[api];
  if (!key) {
    throw new Error(
      `Missing required API key: ${api.toUpperCase()}_API_KEY. ` +
        `Please set it in your .env file.`
    );
  }
  return key;
}

// Re-export types
export type Config = typeof config;
export type ApiKeyName = keyof typeof config.apiKeys;

// Re-export cost configuration
export * from './costs.js';
