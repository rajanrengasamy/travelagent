/**
 * CLI Version Information
 *
 * Version constant used throughout the CLI.
 * Synchronized with package.json version.
 *
 * @module cli/version
 */

/**
 * Current CLI version.
 * Should match package.json version.
 */
export const VERSION = '1.0.0';

/**
 * Get version information for display.
 *
 * @returns Formatted version string
 */
export function getVersionInfo(): string {
  return `Travel Discovery Orchestrator v${VERSION}`;
}
