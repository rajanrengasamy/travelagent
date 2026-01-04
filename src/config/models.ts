/**
 * Model Configuration
 *
 * Defines LLM models, temperatures, and token budgets for each task type.
 * Models can be overridden via environment variables.
 *
 * @module config/models
 * @see PRD Section 9.1 - Model Configuration
 */

import { z } from 'zod';

/**
 * Provider types
 */
export type ModelProvider = 'openai' | 'google' | 'perplexity';

/**
 * Model configuration for a specific task
 */
export interface ModelConfig {
  /** Model identifier */
  modelId: string;
  /** Provider (for routing API calls) */
  provider: ModelProvider;
  /** Temperature setting (0.0 - 1.0) */
  temperature: number;
  /** Maximum input tokens */
  maxInputTokens: number;
  /** Maximum output tokens */
  maxOutputTokens: number;
  /** Environment variable for override */
  envOverride?: string;
}

/**
 * Task types that use LLM models
 */
export type TaskType =
  | 'enhancement'
  | 'router'
  | 'normalizer'
  | 'aggregator'
  | 'longContext'
  | 'validation'
  | 'youtube';

/**
 * Default model configurations per task
 */
const DEFAULT_MODELS: Record<TaskType, ModelConfig> = {
  enhancement: {
    modelId: 'gemini-3-flash-preview',
    provider: 'google',
    temperature: 0.3,
    maxInputTokens: 2000,
    maxOutputTokens: 1000,
    envOverride: 'ENHANCEMENT_MODEL',
  },
  router: {
    modelId: 'gemini-3-flash-preview',
    provider: 'google',
    temperature: 0.3,
    maxInputTokens: 4000,
    maxOutputTokens: 2000,
    envOverride: 'ROUTER_MODEL',
  },
  normalizer: {
    modelId: 'gemini-3-flash-preview',
    provider: 'google',
    temperature: 0.2,
    maxInputTokens: 8000,
    maxOutputTokens: 4000,
    envOverride: 'NORMALIZER_MODEL',
  },
  aggregator: {
    modelId: 'gpt-5.2',
    provider: 'openai',
    temperature: 0.5,
    maxInputTokens: 32000,
    maxOutputTokens: 8000,
    envOverride: 'AGGREGATOR_MODEL',
  },
  longContext: {
    modelId: 'gemini-3-pro-preview',
    provider: 'google',
    temperature: 0.3,
    maxInputTokens: 128000,
    maxOutputTokens: 8000,
    envOverride: 'LONG_CONTEXT_MODEL',
  },
  validation: {
    modelId: 'sonar-pro',
    provider: 'perplexity',
    temperature: 0.3,
    maxInputTokens: 2000,
    maxOutputTokens: 500,
    // No env override for validation - always uses Perplexity
  },
  youtube: {
    modelId: 'gemini-3-flash-preview',
    provider: 'google',
    temperature: 0.2,
    maxInputTokens: 8000,
    maxOutputTokens: 4000,
    envOverride: 'YOUTUBE_MODEL',
  },
};

/**
 * Determine provider from model ID
 */
function getProviderFromModelId(modelId: string): ModelProvider {
  if (
    modelId.startsWith('gpt-') ||
    modelId.startsWith('o1') ||
    modelId.startsWith('text-embedding')
  ) {
    return 'openai';
  }
  if (modelId.startsWith('gemini-') || modelId.startsWith('models/gemini')) {
    return 'google';
  }
  if (modelId.startsWith('sonar') || modelId.includes('perplexity')) {
    return 'perplexity';
  }
  // Default to google for unknown models
  return 'google';
}

/**
 * Get model configuration for a task, applying any environment overrides
 */
export function getModelConfig(task: TaskType): ModelConfig {
  const defaultConfig = DEFAULT_MODELS[task];

  // Check for environment override
  if (defaultConfig.envOverride) {
    const override = process.env[defaultConfig.envOverride];
    if (override) {
      return {
        ...defaultConfig,
        modelId: override,
        provider: getProviderFromModelId(override),
      };
    }
  }

  return defaultConfig;
}

/**
 * Get all model configurations (with any overrides applied)
 */
export function getAllModelConfigs(): Record<TaskType, ModelConfig> {
  const tasks: TaskType[] = [
    'enhancement',
    'router',
    'normalizer',
    'aggregator',
    'longContext',
    'validation',
    'youtube',
  ];

  return tasks.reduce(
    (acc, task) => {
      acc[task] = getModelConfig(task);
      return acc;
    },
    {} as Record<TaskType, ModelConfig>
  );
}

/**
 * Model config schema for validation
 */
export const modelConfigSchema = z.object({
  modelId: z.string(),
  provider: z.enum(['openai', 'google', 'perplexity']),
  temperature: z.number().min(0).max(2),
  maxInputTokens: z.number().positive(),
  maxOutputTokens: z.number().positive(),
  envOverride: z.string().optional(),
});

/**
 * Validate a model config object
 */
export function validateModelConfig(config: unknown): ModelConfig {
  return modelConfigSchema.parse(config);
}
