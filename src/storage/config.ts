/**
 * Global Config Storage
 *
 * Global CLI configuration stored at ~/.travelagent/config.json
 * Contains user preferences and default settings.
 *
 * @module storage/config
 */

import * as fs from 'node:fs/promises';
import { z } from 'zod';
import { atomicWriteJson } from '../schemas/migrations/index.js';
import { getGlobalConfigPath } from './paths.js';

/**
 * Global configuration schema
 *
 * This is extensible - add fields as needed for user preferences.
 */
export const GlobalConfigSchema = z.object({
  /** Schema version for forward compatibility */
  schemaVersion: z.number().int().positive().default(1),

  /** Default model for enhancement stage */
  defaultEnhancementModel: z.string().optional(),

  /** Default model for aggregation stage */
  defaultAggregatorModel: z.string().optional(),

  /** Whether to skip enhancement by default */
  skipEnhancementByDefault: z.boolean().optional(),

  /** Whether to skip YouTube worker by default */
  skipYoutubeByDefault: z.boolean().optional(),

  /** Whether to skip validation stage by default */
  skipValidationByDefault: z.boolean().optional(),
});

export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;

/**
 * Default configuration when no config file exists
 */
export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  schemaVersion: 1,
};

/**
 * Save global config to disk
 *
 * @param config - The global config to save
 */
export async function saveGlobalConfig(config: GlobalConfig): Promise<void> {
  const validated = GlobalConfigSchema.parse(config);
  const filePath = getGlobalConfigPath();
  await atomicWriteJson(filePath, validated);
}

/**
 * Load global config from disk
 *
 * Returns default config if file doesn't exist.
 *
 * @returns The global config
 * @throws Error if config file exists but is invalid
 */
export async function loadGlobalConfig(): Promise<GlobalConfig> {
  const filePath = getGlobalConfigPath();

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    return GlobalConfigSchema.parse(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return DEFAULT_GLOBAL_CONFIG;
    }
    throw error;
  }
}
