/**
 * Schema Version Registry
 *
 * All persisted schemas include a schemaVersion field for migration support.
 * Each schema type has an independent version number (simple integers).
 *
 * @see PRD Section 12.2
 */

/**
 * Current schema versions for all data types.
 * Increment when making breaking changes to a schema.
 */
export const SCHEMA_VERSIONS = {
  /** Prompt enhancement results */
  enhancement: 1,
  /** Travel session configuration */
  session: 1,
  /** User triage decisions */
  triage: 1,
  /** Final discovery output */
  discoveryResults: 1,
  /** Cost tracking data */
  cost: 1,
  /** Pipeline stage outputs */
  stage: 1,
  /** Run configuration */
  runConfig: 1,
  /** Session manifest */
  manifest: 1,
  /** Individual candidate records */
  candidate: 1,
  /** Worker output data */
  worker: 1,
} as const;

/**
 * All schema types that support versioning
 */
export type SchemaType = keyof typeof SCHEMA_VERSIONS;

/**
 * Get the current version for a schema type
 */
export function getCurrentVersion(schemaType: SchemaType): number {
  return SCHEMA_VERSIONS[schemaType];
}

/**
 * Check if a schema version is current
 */
export function isCurrentVersion(
  schemaType: SchemaType,
  version: number
): boolean {
  return version === SCHEMA_VERSIONS[schemaType];
}
