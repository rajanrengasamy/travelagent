/**
 * ZIP Archive Module
 *
 * Creates ZIP archives from export bundles for easy sharing.
 * Uses the 'archiver' library for cross-platform ZIP support.
 *
 * @module export/zip
 * @see PRD Section 21.0 - Export Functionality
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import archiver from 'archiver';
import { fileExists } from '../storage/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for ZIP archive creation
 */
export interface ZipOptions {
  /** Compression level (0-9, default 6) */
  compressionLevel?: number;

  /** Include a top-level directory in the archive */
  includeRootDir?: boolean;

  /** Custom name for the top-level directory */
  rootDirName?: string;
}

/**
 * Result of ZIP archive creation
 */
export interface ZipResult {
  /** Path to the created ZIP file */
  zipPath: string;

  /** Size of the ZIP file in bytes */
  sizeBytes: number;

  /** Number of files in the archive */
  fileCount: number;

  /** Compression ratio (original size / compressed size) */
  compressionRatio: number;
}

// ============================================================================
// Archive Creation
// ============================================================================

/**
 * Creates a ZIP archive from a bundle directory.
 *
 * @param bundlePath - Path to the bundle directory to archive
 * @param outputPath - Path for the output ZIP file (defaults to bundlePath + '.zip')
 * @param options - ZIP creation options
 * @returns Result with ZIP path and metadata
 *
 * @example
 * ```typescript
 * const result = await createZipArchive(
 *   '/path/to/export-2026-01-15T14-30-00',
 *   '/path/to/export.zip',
 *   { compressionLevel: 9 }
 * );
 * // Returns: { zipPath: '/path/to/export.zip', sizeBytes: 12345, ... }
 * ```
 */
export async function createZipArchive(
  bundlePath: string,
  outputPath?: string,
  options: ZipOptions = {}
): Promise<ZipResult> {
  // Validate bundle path exists (it's a directory, not a file)
  try {
    const stats = await fsPromises.stat(bundlePath);
    if (!stats.isDirectory()) {
      throw new Error(`Bundle path is not a directory: ${bundlePath}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Bundle path does not exist: ${bundlePath}`);
    }
    throw error;
  }

  // Default output path is bundle path + .zip
  const zipPath = outputPath || `${bundlePath}.zip`;

  // Ensure output directory exists
  const outputDir = path.dirname(zipPath);
  await fsPromises.mkdir(outputDir, { recursive: true });

  // Calculate original size
  const originalSize = await calculateDirectorySize(bundlePath);

  // Create archive
  const { fileCount } = await createArchive(bundlePath, zipPath, options);

  // Get final zip size
  const stats = await fsPromises.stat(zipPath);
  const sizeBytes = stats.size;

  // Calculate compression ratio
  const compressionRatio = originalSize > 0 ? originalSize / sizeBytes : 1;

  return {
    zipPath,
    sizeBytes,
    fileCount,
    compressionRatio,
  };
}

/**
 * Creates the actual archive file using the archiver library
 */
async function createArchive(
  bundlePath: string,
  zipPath: string,
  options: ZipOptions
): Promise<{ fileCount: number }> {
  return new Promise((resolve, reject) => {
    // Create output stream
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', {
      zlib: { level: options.compressionLevel ?? 6 },
    });

    let fileCount = 0;

    // Handle stream events
    output.on('close', () => {
      resolve({ fileCount });
    });

    archive.on('entry', () => {
      fileCount++;
    });

    archive.on('warning', (err) => {
      if (err.code !== 'ENOENT') {
        // Log warning but don't fail
        console.warn('Archive warning:', err.message);
      }
    });

    archive.on('error', (err) => {
      reject(new Error(`Archive creation failed: ${err.message}`));
    });

    // Pipe archive to output
    archive.pipe(output);

    // Add directory contents to archive
    const dirName = options.rootDirName || path.basename(bundlePath);

    if (options.includeRootDir) {
      // Include top-level directory
      archive.directory(bundlePath, dirName);
    } else {
      // Add files directly (no top-level directory)
      archive.directory(bundlePath, false);
    }

    // Finalize archive
    archive.finalize();
  });
}

/**
 * Calculates the total size of a directory recursively
 */
async function calculateDirectorySize(dirPath: string): Promise<number> {
  let totalSize = 0;

  const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      totalSize += await calculateDirectorySize(entryPath);
    } else if (entry.isFile()) {
      const stats = await fsPromises.stat(entryPath);
      totalSize += stats.size;
    }
  }

  return totalSize;
}

// ============================================================================
// Archive Extraction
// ============================================================================

/**
 * Extracts a ZIP archive to a directory.
 * Note: Uses built-in unzip or tar command for extraction.
 *
 * @param zipPath - Path to the ZIP file
 * @param outputDir - Directory to extract to
 * @returns Path to the extracted directory
 */
export async function extractZipArchive(zipPath: string, outputDir: string): Promise<string> {
  // Validate ZIP file exists
  if (!(await fileExists(zipPath))) {
    throw new Error(`ZIP file does not exist: ${zipPath}`);
  }

  // Ensure output directory exists
  await fsPromises.mkdir(outputDir, { recursive: true });

  // Use Node's built-in extraction via child_process
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execAsync = promisify(exec);

  try {
    // Use unzip command (available on macOS/Linux)
    await execAsync(`unzip -o "${zipPath}" -d "${outputDir}"`);
  } catch (error) {
    // Try tar command as fallback
    try {
      await execAsync(`tar -xzf "${zipPath}" -C "${outputDir}"`);
    } catch {
      throw new Error(`Failed to extract ZIP file: ${(error as Error).message}`);
    }
  }

  return outputDir;
}

// ============================================================================
// Archive Validation
// ============================================================================

/**
 * Validates a ZIP archive is readable and not corrupted.
 *
 * @param zipPath - Path to the ZIP file
 * @returns Validation result
 */
export async function validateZipArchive(zipPath: string): Promise<{
  valid: boolean;
  sizeBytes: number;
  error?: string;
}> {
  try {
    // Check file exists
    if (!(await fileExists(zipPath))) {
      return { valid: false, sizeBytes: 0, error: 'File does not exist' };
    }

    // Get file stats
    const stats = await fsPromises.stat(zipPath);

    // Check it's a file
    if (!stats.isFile()) {
      return { valid: false, sizeBytes: 0, error: 'Path is not a file' };
    }

    // Check minimum size (ZIP header is at least 22 bytes)
    if (stats.size < 22) {
      return { valid: false, sizeBytes: stats.size, error: 'File too small to be valid ZIP' };
    }

    // Check ZIP magic bytes (PK\x03\x04)
    const handle = await fsPromises.open(zipPath, 'r');
    try {
      const buffer = Buffer.alloc(4);
      await handle.read(buffer, 0, 4, 0);

      // Check for ZIP signature
      const isZip =
        buffer[0] === 0x50 && // P
        buffer[1] === 0x4b && // K
        (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
        (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08);

      if (!isZip) {
        return { valid: false, sizeBytes: stats.size, error: 'Invalid ZIP signature' };
      }
    } finally {
      await handle.close();
    }

    return { valid: true, sizeBytes: stats.size };
  } catch (error) {
    return {
      valid: false,
      sizeBytes: 0,
      error: `Validation error: ${(error as Error).message}`,
    };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Formats a file size in human-readable format.
 *
 * @param bytes - Size in bytes
 * @returns Formatted string (e.g., "1.5 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);

  // Format with appropriate precision
  if (i === 0) {
    return `${bytes} B`;
  } else if (size >= 100) {
    return `${Math.round(size)} ${units[i]}`;
  } else if (size >= 10) {
    return `${size.toFixed(1)} ${units[i]}`;
  } else {
    return `${size.toFixed(2)} ${units[i]}`;
  }
}

/**
 * Generates a filename for ZIP export.
 *
 * @param sessionId - Session ID
 * @param runId - Run ID
 * @returns Suggested filename
 */
export function generateZipFilename(sessionId: string, runId: string): string {
  const timestamp = new Date().toISOString().slice(0, 10);
  return `${sessionId}_${runId}_${timestamp}.zip`;
}
