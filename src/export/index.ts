/**
 * Export Module
 *
 * Provides functionality for exporting session/run data as bundles
 * and ZIP archives for sharing or backup purposes.
 *
 * Components:
 * - Bundler: Creates export bundles with configurable content
 * - Zip: Creates and validates ZIP archives
 *
 * @module export
 * @see PRD Section 21.0 - Export Functionality
 */

// ============================================================================
// Bundler Exports
// ============================================================================

export {
  createExportBundle,
  validateBundle,
  listBundles,
  deleteBundle,
  type ExportOptions,
  type ExportBundleManifest,
  type ExportFileEntry,
  type BundleResult,
} from './bundler.js';

// ============================================================================
// ZIP Archive Exports
// ============================================================================

export {
  createZipArchive,
  extractZipArchive,
  validateZipArchive,
  formatFileSize,
  generateZipFilename,
  type ZipOptions,
  type ZipResult,
} from './zip.js';

// ============================================================================
// Convenience Functions
// ============================================================================

import { createExportBundle, type ExportOptions } from './bundler.js';
import { createZipArchive, type ZipOptions, type ZipResult } from './zip.js';

/**
 * Creates an export bundle and optionally zips it.
 *
 * This is a convenience function that combines bundle creation
 * and ZIP archive creation in a single call.
 *
 * @param sessionId - Session ID to export
 * @param runId - Run ID to export (defaults to 'latest')
 * @param options - Export options including zip flag
 * @returns Bundle path or ZIP result if zip option is set
 *
 * @example
 * ```typescript
 * // Create bundle only
 * const result = await exportSession('20260115-japan', 'latest');
 *
 * // Create bundle and zip
 * const result = await exportSession('20260115-japan', 'latest', { zip: true });
 * ```
 */
export async function exportSession(
  sessionId: string,
  runId: string = 'latest',
  options: ExportOptions & { zip?: boolean; zipOptions?: ZipOptions } = {}
): Promise<{ bundlePath: string; zipResult?: ZipResult }> {
  const { zip, zipOptions, ...exportOptions } = options;

  // Create the export bundle
  const bundleResult = await createExportBundle(sessionId, runId, exportOptions);

  // If zip option is set, create ZIP archive
  if (zip) {
    const zipResult = await createZipArchive(bundleResult.bundlePath, undefined, zipOptions);
    return {
      bundlePath: bundleResult.bundlePath,
      zipResult,
    };
  }

  return { bundlePath: bundleResult.bundlePath };
}
