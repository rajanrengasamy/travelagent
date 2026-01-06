/**
 * Schema Migration Framework
 *
 * Lazy migration on read - when loading data with an older schema version,
 * run the migration chain to bring it to the current version.
 *
 * @see PRD Section 12.1 - Schema Versioning Strategy
 */

import { SCHEMA_VERSIONS, type SchemaType } from '../versions.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Migration function type
 * Takes data at version N and returns data at version N+1
 */
export type Migration = (data: unknown) => unknown;

/**
 * Migration registry key format: "schemaType:fromVersion:toVersion"
 */
type MigrationKey = `${SchemaType}:${number}:${number}`;

// ============================================================================
// Migration Registry
// ============================================================================

/**
 * Migration registry - maps schema type to version migrations
 * Key format: "schemaType:fromVersion:toVersion"
 *
 * Register migrations when making breaking schema changes.
 *
 * @example
 * // If session schema v2 adds a required "timezone" field:
 * registerMigration('session', 1, 2, (data) => ({
 *   ...data,
 *   timezone: 'UTC', // Default value for migrated data
 * }));
 */
const migrations: Map<MigrationKey, Migration> = new Map();

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get the current version for a schema type
 */
export function getCurrentVersion(schemaType: SchemaType): number {
  return SCHEMA_VERSIONS[schemaType];
}

/**
 * Check if migration is needed
 *
 * @param data - Raw parsed JSON data
 * @param schemaType - The type of schema
 * @returns true if data version is older than current
 */
export function needsMigration(data: unknown, schemaType: SchemaType): boolean {
  const version = extractSchemaVersion(data);
  return version < getCurrentVersion(schemaType);
}

/**
 * Migrate data from its version to current
 *
 * @param data - Raw parsed JSON data
 * @param schemaType - The type of schema
 * @returns Migrated data at current version
 *
 * @example
 * const rawData = JSON.parse(fileContent);
 * const migratedData = migrateSchema<Session>(rawData, 'session');
 * const session = SessionSchema.parse(migratedData);
 */
export function migrateSchema<T>(data: unknown, schemaType: SchemaType): T {
  const current = getCurrentVersion(schemaType);
  let version = extractSchemaVersion(data);
  let migrated = data;

  // Run migration chain from current version to target
  while (version < current) {
    const key: MigrationKey = `${schemaType}:${version}:${version + 1}`;
    const migration = migrations.get(key);

    if (migration) {
      migrated = migration(migrated);
    }
    // If no migration registered, assume forward-compatible (new optional fields)

    version++;
  }

  // Update schemaVersion to current
  if (typeof migrated === 'object' && migrated !== null) {
    (migrated as { schemaVersion: number }).schemaVersion = current;
  }

  return migrated as T;
}

/**
 * Register a new migration
 *
 * @param schemaType - The schema type this migration applies to
 * @param fromVersion - Source version
 * @param toVersion - Target version (must be fromVersion + 1)
 * @param migration - Migration function
 *
 * @example
 * registerMigration('session', 1, 2, (data) => ({
 *   ...data,
 *   newRequiredField: 'default_value',
 * }));
 */
export function registerMigration(
  schemaType: SchemaType,
  fromVersion: number,
  toVersion: number,
  migration: Migration
): void {
  if (toVersion !== fromVersion + 1) {
    throw new Error(
      `Migration must increment version by 1. Got ${fromVersion} -> ${toVersion}`
    );
  }

  const key: MigrationKey = `${schemaType}:${fromVersion}:${toVersion}`;

  if (migrations.has(key)) {
    throw new Error(`Migration already registered for ${key}`);
  }

  migrations.set(key, migration);
}

/**
 * Check if a migration exists for a specific version transition
 */
export function hasMigration(
  schemaType: SchemaType,
  fromVersion: number,
  toVersion: number
): boolean {
  const key: MigrationKey = `${schemaType}:${fromVersion}:${toVersion}`;
  return migrations.has(key);
}

/**
 * Get all registered migrations (for debugging/testing)
 */
export function getRegisteredMigrations(): string[] {
  return Array.from(migrations.keys());
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract schema version from data, defaulting to 1 if not present
 */
function extractSchemaVersion(data: unknown): number {
  if (typeof data !== 'object' || data === null) {
    return 1;
  }

  const version = (data as { schemaVersion?: unknown }).schemaVersion;

  if (typeof version === 'number' && Number.isInteger(version) && version > 0) {
    return version;
  }

  return 1; // Default to version 1 for legacy data
}

// ============================================================================
// Migration Loader
// ============================================================================

/**
 * Load and parse JSON with automatic migration
 *
 * @param json - JSON string to parse
 * @param schemaType - Schema type for migration
 * @returns Migrated data
 */
export function loadAndMigrate<T>(json: string, schemaType: SchemaType): T {
  const data: unknown = JSON.parse(json);
  return migrateSchema<T>(data, schemaType);
}

// ============================================================================
// Atomic Write-Back
// ============================================================================

/**
 * Load JSON file, migrate if needed, and atomically write back
 *
 * Uses temp file + rename pattern for atomic writes as per PRD Section 12.1:
 * 1. Write migrated data to temp file
 * 2. Rename temp file to target (atomic on most filesystems)
 *
 * @param filePath - Path to the JSON file
 * @param schemaType - Schema type for migration
 * @returns Object containing migrated data and whether migration occurred
 *
 * @example
 * const result = await loadMigrateAndSave<Session>('/path/to/session.json', 'session');
 * if (result.migrated) {
 *   console.log('File was migrated to version', result.data.schemaVersion);
 * }
 */
export async function loadMigrateAndSave<T>(
  filePath: string,
  schemaType: SchemaType
): Promise<{ data: T; migrated: boolean }> {
  // Dynamic import to avoid bundling fs in browser contexts
  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  // Read and parse file
  const content = await fs.readFile(filePath, 'utf-8');
  const data: unknown = JSON.parse(content);

  // Check if migration is needed
  const wasMigrated = needsMigration(data, schemaType);

  // Migrate the data
  const migrated = migrateSchema<T>(data, schemaType);

  // Only write back if migration occurred
  if (wasMigrated) {
    // Atomic write: temp file + rename
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    const migratedJson = JSON.stringify(migrated, null, 2);

    try {
      // Ensure parent directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      // Write to temp file
      await fs.writeFile(tempPath, migratedJson, 'utf-8');

      // Atomic rename
      await fs.rename(tempPath, filePath);
    } catch (error) {
      // Clean up temp file if it exists
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      // Re-throw with file context for better debugging
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration failed for ${filePath}: ${message}`, {
        cause: error,
      });
    }
  }

  return { data: migrated, migrated: wasMigrated };
}

/**
 * Atomically write JSON data to a file
 *
 * Uses temp file + rename pattern for atomic writes.
 *
 * Note: If the process crashes between temp file creation and rename,
 * orphaned .tmp.* files may remain in the target directory.
 * Consider periodic cleanup of files matching pattern: *.tmp.*
 *
 * @param filePath - Target file path
 * @param data - Data to write (will be JSON.stringify'd)
 *
 * @example
 * await atomicWriteJson('/path/to/file.json', { schemaVersion: 1, ... });
 */
export async function atomicWriteJson(
  filePath: string,
  data: unknown
): Promise<void> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  const tempPath = `${filePath}.tmp.${Date.now()}`;
  const json = JSON.stringify(data, null, 2);

  try {
    // Ensure parent directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    // Write to temp file
    await fs.writeFile(tempPath, json, 'utf-8');

    // Atomic rename
    await fs.rename(tempPath, filePath);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await fs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    // Re-throw with file context for better debugging
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Atomic write failed for ${filePath}: ${message}`, {
      cause: error,
    });
  }
}
