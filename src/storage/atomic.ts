/**
 * Atomic File Operations for Storage Layer
 *
 * Provides atomic write operations using temp file + rename pattern,
 * plus complementary read operations.
 *
 * @module storage/atomic
 */

import * as fs from 'node:fs/promises';

// Re-export atomic write from migrations
export { atomicWriteJson } from '../schemas/migrations/index.js';

/**
 * Read and parse a JSON file
 *
 * @param filePath - Path to the JSON file
 * @returns Parsed JSON data
 * @throws Error if file doesn't exist or JSON is invalid
 */
export async function readJson<T>(filePath: string): Promise<T> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`File not found: ${filePath}`);
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in file: ${filePath}`);
    }
    throw error;
  }
}

/**
 * Check if a file exists (not a directory)
 *
 * @param filePath - Path to check
 * @returns true if file exists, false otherwise
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}
