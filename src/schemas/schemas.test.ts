/**
 * Unit Tests for All Zod Schemas
 *
 * Tests each schema with valid and invalid data to ensure proper validation.
 *
 * @see PRD Section 12 - Data Model
 * @see PRD Section 2.15 - Write unit tests for all schemas
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

import {
  // Common types
  FlexibilitySchema,
  DateRangeSchema,
  ISO8601TimestampSchema,
  CoordinatesSchema,
  SourceRefSchema,
  ValidationStatusSchema,
  CandidateTypeSchema,
  CandidateOriginSchema,
  CandidateConfidenceSchema,
  // Session
  SessionSchema,
  SessionIdSchema,
  // Enhancement
  PromptAnalysisSchema,
  EnhancementResultSchema,
  EnhancementActionSchema,
  DEFAULT_ENHANCEMENT_CONFIG,
  // Candidate
  CandidateSchema,
  // Triage
  TriageStatusSchema,
  TriageStateSchema,
  // Discovery Results
  DegradationLevelSchema,
  WorkerSummarySchema,
  // Cost
  TokenUsageSchema,
  createEmptyCostBreakdown,
  // Stage
  StageIdSchema,
  createStageMetadata,
  parseStageNumber,
  parseStageName,
  // Run Config
  RunStatusSchema,
  RunModeSchema,
  DEFAULT_LIMITS,
  DEFAULT_FLAGS,
  // Manifest
  ManifestStageEntrySchema,
  createEmptyManifest,
  // Worker
  EnrichedIntentSchema,
  createErrorWorkerOutput,
  createSkippedWorkerOutput,
  // Migrations
  migrateSchema,
  needsMigration,
  registerMigration,
  hasMigration,
  loadAndMigrate,
  loadMigrateAndSave,
  atomicWriteJson,
  getCurrentVersion,
  SCHEMA_VERSIONS,
  type SchemaType,
} from './index.js';

// ============================================================================
// Common Types Tests
// ============================================================================

describe('Common Types', () => {
  describe('FlexibilitySchema', () => {
    it('accepts none type', () => {
      const result = FlexibilitySchema.safeParse({ type: 'none' });
      expect(result.success).toBe(true);
    });

    it('accepts plusMinusDays type', () => {
      const result = FlexibilitySchema.safeParse({ type: 'plusMinusDays', days: 3 });
      expect(result.success).toBe(true);
    });

    it('accepts monthOnly type', () => {
      const result = FlexibilitySchema.safeParse({ type: 'monthOnly', month: '2026-01' });
      expect(result.success).toBe(true);
    });

    it('rejects invalid type', () => {
      const result = FlexibilitySchema.safeParse({ type: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('rejects plusMinusDays without days', () => {
      const result = FlexibilitySchema.safeParse({ type: 'plusMinusDays' });
      expect(result.success).toBe(false);
    });

    it('rejects negative days', () => {
      const result = FlexibilitySchema.safeParse({ type: 'plusMinusDays', days: -1 });
      expect(result.success).toBe(false);
    });
  });

  describe('DateRangeSchema', () => {
    it('accepts valid date range', () => {
      const result = DateRangeSchema.safeParse({
        start: '2026-01-01',
        end: '2026-01-15',
      });
      expect(result.success).toBe(true);
    });

    it('rejects end before start', () => {
      const result = DateRangeSchema.safeParse({
        start: '2026-01-15',
        end: '2026-01-01',
      });
      expect(result.success).toBe(false);
    });

    it('accepts same day range', () => {
      const result = DateRangeSchema.safeParse({
        start: '2026-01-15',
        end: '2026-01-15',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('ISO8601TimestampSchema', () => {
    it('accepts valid ISO8601 timestamp', () => {
      const result = ISO8601TimestampSchema.safeParse('2026-01-02T10:30:00.000Z');
      expect(result.success).toBe(true);
    });

    it('rejects invalid format', () => {
      const result = ISO8601TimestampSchema.safeParse('2026-01-02');
      expect(result.success).toBe(false);
    });
  });

  describe('CoordinatesSchema', () => {
    it('accepts valid coordinates', () => {
      const result = CoordinatesSchema.safeParse({ lat: 35.6762, lng: 139.6503 });
      expect(result.success).toBe(true);
    });

    it('rejects latitude out of range', () => {
      const result = CoordinatesSchema.safeParse({ lat: 91, lng: 0 });
      expect(result.success).toBe(false);
    });

    it('rejects longitude out of range', () => {
      const result = CoordinatesSchema.safeParse({ lat: 0, lng: 181 });
      expect(result.success).toBe(false);
    });
  });

  describe('SourceRefSchema', () => {
    it('accepts valid source ref', () => {
      const result = SourceRefSchema.safeParse({
        url: 'https://example.com/article',
        retrievedAt: '2026-01-02T10:30:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('accepts with optional fields', () => {
      const result = SourceRefSchema.safeParse({
        url: 'https://example.com',
        publisher: 'Example Publisher',
        retrievedAt: '2026-01-02T10:30:00.000Z',
        snippet: 'A short snippet of text',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid URL', () => {
      const result = SourceRefSchema.safeParse({
        url: 'not-a-url',
        retrievedAt: '2026-01-02T10:30:00.000Z',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Enum Schemas', () => {
    it('ValidationStatusSchema accepts valid values', () => {
      const validValues = ['verified', 'partially_verified', 'conflict_detected', 'unverified', 'not_applicable'];
      validValues.forEach(value => {
        expect(ValidationStatusSchema.safeParse(value).success).toBe(true);
      });
    });

    it('CandidateTypeSchema accepts valid values', () => {
      const validValues = ['place', 'activity', 'neighborhood', 'daytrip', 'experience', 'food'];
      validValues.forEach(value => {
        expect(CandidateTypeSchema.safeParse(value).success).toBe(true);
      });
    });

    it('CandidateOriginSchema accepts valid values', () => {
      const validValues = ['web', 'places', 'youtube'];
      validValues.forEach(value => {
        expect(CandidateOriginSchema.safeParse(value).success).toBe(true);
      });
    });

    it('CandidateConfidenceSchema accepts valid values', () => {
      const validValues = ['needs_verification', 'provisional', 'verified', 'high'];
      validValues.forEach(value => {
        expect(CandidateConfidenceSchema.safeParse(value).success).toBe(true);
      });
    });
  });
});

// ============================================================================
// Session Schema Tests
// ============================================================================

describe('Session Schema', () => {
  describe('SessionIdSchema', () => {
    it('accepts valid session ID format', () => {
      const result = SessionIdSchema.safeParse('20260102-japan-food-temples');
      expect(result.success).toBe(true);
    });

    it('rejects invalid format', () => {
      const result = SessionIdSchema.safeParse('invalid-session-id');
      expect(result.success).toBe(false);
    });

    it('rejects empty slug', () => {
      const result = SessionIdSchema.safeParse('20260102-');
      expect(result.success).toBe(false);
    });
  });

  describe('SessionSchema', () => {
    const validSession = {
      schemaVersion: 1,
      sessionId: '20260102-japan-food-temples',
      title: 'Japan Trip',
      destinations: ['Tokyo', 'Kyoto'],
      dateRange: { start: '2026-04-01', end: '2026-04-15' },
      flexibility: { type: 'plusMinusDays', days: 3 },
      interests: ['food', 'temples', 'nature'],
      createdAt: '2026-01-02T10:30:00.000Z',
    };

    it('accepts valid session', () => {
      const result = SessionSchema.safeParse(validSession);
      expect(result.success).toBe(true);
    });

    it('rejects empty destinations', () => {
      const result = SessionSchema.safeParse({
        ...validSession,
        destinations: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty interests', () => {
      const result = SessionSchema.safeParse({
        ...validSession,
        interests: [],
      });
      expect(result.success).toBe(false);
    });

    it('accepts optional fields', () => {
      const result = SessionSchema.safeParse({
        ...validSession,
        constraints: { budget: 'medium' },
        archivedAt: '2026-02-01T10:00:00.000Z',
        lastRunId: '20260102-143000',
      });
      expect(result.success).toBe(true);
    });
  });
});

// ============================================================================
// Enhancement Schema Tests
// ============================================================================

describe('Enhancement Schema', () => {
  describe('PromptAnalysisSchema', () => {
    it('accepts clear prompt analysis', () => {
      const result = PromptAnalysisSchema.safeParse({
        isClear: true,
        confidence: 0.85,
        reasoning: 'The prompt provides clear destination and dates',
        suggestedRefinement: 'Trip to Tokyo in April...',
      });
      expect(result.success).toBe(true);
    });

    it('accepts unclear prompt analysis with questions', () => {
      const result = PromptAnalysisSchema.safeParse({
        isClear: false,
        confidence: 0.3,
        reasoning: 'Missing destination information',
        clarifyingQuestions: ['What destinations are you considering?', 'When do you plan to travel?'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects confidence out of range', () => {
      const result = PromptAnalysisSchema.safeParse({
        isClear: true,
        confidence: 1.5,
        reasoning: 'Test',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('EnhancementResultSchema', () => {
    it('accepts valid enhancement result', () => {
      const result = EnhancementResultSchema.safeParse({
        schemaVersion: 1,
        originalPrompt: 'I want to visit Japan',
        refinedPrompt: 'Trip to Tokyo and Kyoto in April 2026...',
        wasEnhanced: true,
        extractedParams: {
          destinations: ['Tokyo', 'Kyoto'],
        },
        iterationCount: 2,
        modelUsed: 'gemini-3-flash-preview',
        processingTimeMs: 1500,
        createdAt: '2026-01-02T10:30:00.000Z',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('EnhancementActionSchema', () => {
    it('accepts valid actions', () => {
      const actions = ['accept', 'reject', 'feedback', 'skip'];
      actions.forEach(action => {
        expect(EnhancementActionSchema.safeParse(action).success).toBe(true);
      });
    });
  });

  describe('DEFAULT_ENHANCEMENT_CONFIG', () => {
    it('has correct default values', () => {
      expect(DEFAULT_ENHANCEMENT_CONFIG.skip).toBe(false);
      expect(DEFAULT_ENHANCEMENT_CONFIG.model).toBe('gemini');
      expect(DEFAULT_ENHANCEMENT_CONFIG.maxIterations).toBe(3);
      expect(DEFAULT_ENHANCEMENT_CONFIG.timeoutMs).toBe(15000);
      expect(DEFAULT_ENHANCEMENT_CONFIG.autoEnhance).toBe(false);
    });
  });
});

// ============================================================================
// Candidate Schema Tests
// ============================================================================

describe('Candidate Schema', () => {
  const validCandidate = {
    candidateId: 'cand-001',
    type: 'place',
    title: 'Senso-ji Temple',
    summary: 'Famous Buddhist temple in Asakusa',
    locationText: 'Asakusa, Tokyo, Japan',
    tags: ['temple', 'historic', 'cultural'],
    origin: 'places',
    sourceRefs: [
      {
        url: 'https://maps.google.com/?cid=123',
        retrievedAt: '2026-01-02T10:30:00.000Z',
      },
    ],
    confidence: 'verified',
    score: 85,
  };

  it('accepts valid candidate', () => {
    const result = CandidateSchema.safeParse(validCandidate);
    expect(result.success).toBe(true);
  });

  it('rejects score out of range', () => {
    const result = CandidateSchema.safeParse({
      ...validCandidate,
      score: 150,
    });
    expect(result.success).toBe(false);
  });

  it('accepts candidate with metadata', () => {
    const result = CandidateSchema.safeParse({
      ...validCandidate,
      metadata: {
        placeId: 'ChIJP3Sa8ziYEmsRUKgyFmh9AQM',
        rating: 4.5,
        priceLevel: 2,
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid rating', () => {
    const result = CandidateSchema.safeParse({
      ...validCandidate,
      metadata: {
        rating: 6, // Max is 5
      },
    });
    expect(result.success).toBe(false);
  });

  it('accepts candidate with validation', () => {
    const result = CandidateSchema.safeParse({
      ...validCandidate,
      validation: {
        status: 'verified',
        notes: 'Confirmed via Google Places',
      },
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Triage Schema Tests
// ============================================================================

describe('Triage Schema', () => {
  describe('TriageStatusSchema', () => {
    it('accepts valid statuses', () => {
      const statuses = ['must', 'research', 'maybe'];
      statuses.forEach(status => {
        expect(TriageStatusSchema.safeParse(status).success).toBe(true);
      });
    });
  });

  describe('TriageStateSchema', () => {
    it('accepts valid triage state', () => {
      const result = TriageStateSchema.safeParse({
        schemaVersion: 1,
        sessionId: '20260102-japan-trip',
        entries: [
          {
            candidateId: 'cand-001',
            status: 'must',
            notes: 'Top priority',
            updatedAt: '2026-01-02T10:30:00.000Z',
          },
        ],
        updatedAt: '2026-01-02T10:30:00.000Z',
      });
      expect(result.success).toBe(true);
    });
  });
});

// ============================================================================
// Discovery Results Schema Tests
// ============================================================================

describe('Discovery Results Schema', () => {
  describe('DegradationLevelSchema', () => {
    it('accepts valid levels', () => {
      const levels = ['none', 'partial_workers', 'no_aggregation', 'timeout', 'failed'];
      levels.forEach(level => {
        expect(DegradationLevelSchema.safeParse(level).success).toBe(true);
      });
    });
  });

  describe('WorkerSummarySchema', () => {
    it('accepts valid worker summary', () => {
      const result = WorkerSummarySchema.safeParse({
        workerId: 'perplexity',
        status: 'ok',
        durationMs: 2500,
        candidateCount: 15,
      });
      expect(result.success).toBe(true);
    });

    it('accepts with error message', () => {
      const result = WorkerSummarySchema.safeParse({
        workerId: 'youtube',
        status: 'error',
        durationMs: 5000,
        candidateCount: 0,
        errorMessage: 'API quota exceeded',
      });
      expect(result.success).toBe(true);
    });
  });
});

// ============================================================================
// Cost Schema Tests
// ============================================================================

describe('Cost Schema', () => {
  describe('TokenUsageSchema', () => {
    it('accepts valid token usage', () => {
      const result = TokenUsageSchema.safeParse({
        input: 1000,
        output: 500,
      });
      expect(result.success).toBe(true);
    });

    it('rejects negative tokens', () => {
      const result = TokenUsageSchema.safeParse({
        input: -100,
        output: 500,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createEmptyCostBreakdown', () => {
    it('creates valid empty breakdown', () => {
      const breakdown = createEmptyCostBreakdown('run-001');
      expect(breakdown.runId).toBe('run-001');
      expect(breakdown.total).toBe(0);
      expect(breakdown.currency).toBe('USD');
      expect(breakdown.providers).toEqual({});
    });
  });
});

// ============================================================================
// Stage Schema Tests
// ============================================================================

describe('Stage Schema', () => {
  describe('StageIdSchema', () => {
    it('accepts valid stage ID format', () => {
      const result = StageIdSchema.safeParse('08_top_candidates');
      expect(result.success).toBe(true);
    });

    it('rejects invalid format', () => {
      const result = StageIdSchema.safeParse('invalid');
      expect(result.success).toBe(false);
    });
  });

  describe('createStageMetadata', () => {
    it('creates valid stage metadata', () => {
      const meta = createStageMetadata({
        stageNumber: 8,
        stageName: 'top_candidates',
        sessionId: '20260102-japan-trip',
        runId: '20260102-143000',
      });

      expect(meta.stageId).toBe('08_top_candidates');
      expect(meta.schemaVersion).toBe(SCHEMA_VERSIONS.stage);
      expect(meta.createdAt).toBeDefined();
    });
  });

  describe('parseStageNumber', () => {
    it('extracts stage number from ID', () => {
      expect(parseStageNumber('08_top_candidates')).toBe(8);
      expect(parseStageNumber('00_enhancement')).toBe(0);
      expect(parseStageNumber('10_results')).toBe(10);
    });

    it('throws for invalid ID', () => {
      expect(() => parseStageNumber('invalid')).toThrow('Invalid stage ID format');
    });
  });

  describe('parseStageName', () => {
    it('extracts stage name from ID', () => {
      expect(parseStageName('08_top_candidates')).toBe('top_candidates');
      expect(parseStageName('00_enhancement')).toBe('enhancement');
    });

    it('throws for invalid ID', () => {
      expect(() => parseStageName('invalid')).toThrow('Invalid stage ID format');
    });
  });
});

// ============================================================================
// Run Config Schema Tests
// ============================================================================

describe('Run Config Schema', () => {
  describe('RunStatusSchema', () => {
    it('accepts valid statuses', () => {
      const statuses = ['running', 'completed', 'failed', 'partial'];
      statuses.forEach(status => {
        expect(RunStatusSchema.safeParse(status).success).toBe(true);
      });
    });
  });

  describe('RunModeSchema', () => {
    it('accepts valid modes', () => {
      const modes = ['full', 'from-stage'];
      modes.forEach(mode => {
        expect(RunModeSchema.safeParse(mode).success).toBe(true);
      });
    });
  });

  describe('DEFAULT_LIMITS', () => {
    it('has expected default values', () => {
      expect(DEFAULT_LIMITS.maxCandidatesPerWorker).toBeGreaterThan(0);
      expect(DEFAULT_LIMITS.maxTopCandidates).toBeGreaterThan(0);
      expect(DEFAULT_LIMITS.workerTimeout).toBeGreaterThan(0);
    });
  });

  describe('DEFAULT_FLAGS', () => {
    it('has expected default values', () => {
      expect(DEFAULT_FLAGS.skipValidation).toBe(false);
      expect(DEFAULT_FLAGS.skipYoutube).toBe(false);
    });
  });
});

// ============================================================================
// Manifest Schema Tests
// ============================================================================

describe('Manifest Schema', () => {
  describe('ManifestStageEntrySchema', () => {
    it('accepts valid stage entry', () => {
      const result = ManifestStageEntrySchema.safeParse({
        stageId: '08_top_candidates',
        filename: '08_top_candidates.json',
        createdAt: '2026-01-02T10:30:00.000Z',
        sha256: 'a'.repeat(64),
        sizeBytes: 1024,
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid SHA-256 hash', () => {
      const result = ManifestStageEntrySchema.safeParse({
        stageId: '08_top_candidates',
        filename: '08_top_candidates.json',
        createdAt: '2026-01-02T10:30:00.000Z',
        sha256: 'too-short',
        sizeBytes: 1024,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createEmptyManifest', () => {
    it('creates valid empty manifest', () => {
      const manifest = createEmptyManifest('run-001', '20260102-japan-trip');
      expect(manifest.runId).toBe('run-001');
      expect(manifest.sessionId).toBe('20260102-japan-trip');
      expect(manifest.stages).toEqual([]);
      expect(manifest.stagesExecuted).toEqual([]);
      expect(manifest.stagesSkipped).toEqual([]);
      expect(manifest.success).toBe(false);
    });
  });
});

// ============================================================================
// Worker Schema Tests
// ============================================================================

describe('Worker Schema', () => {
  describe('EnrichedIntentSchema', () => {
    it('accepts valid enriched intent', () => {
      const result = EnrichedIntentSchema.safeParse({
        destinations: ['Tokyo'],
        dateRange: { start: '2026-04-01', end: '2026-04-15' },
        flexibility: { type: 'none' },
        interests: ['food'],
        constraints: {},
        inferredTags: ['urban', 'cultural'],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('createErrorWorkerOutput', () => {
    it('creates valid error output', () => {
      const output = createErrorWorkerOutput('perplexity', 'API error', 1000);
      expect(output.workerId).toBe('perplexity');
      expect(output.status).toBe('error');
      expect(output.error).toBe('API error');
      expect(output.candidates).toEqual([]);
      expect(output.durationMs).toBe(1000);
    });
  });

  describe('createSkippedWorkerOutput', () => {
    it('creates valid skipped output', () => {
      const output = createSkippedWorkerOutput('youtube');
      expect(output.workerId).toBe('youtube');
      expect(output.status).toBe('skipped');
      expect(output.candidates).toEqual([]);
      expect(output.durationMs).toBe(0);
    });
  });
});

// ============================================================================
// Migration Tests
// ============================================================================

describe('Migration Framework', () => {
  describe('getCurrentVersion', () => {
    it('returns correct version for each schema type', () => {
      const schemaTypes: SchemaType[] = [
        'enhancement', 'session', 'triage', 'discoveryResults',
        'cost', 'stage', 'runConfig', 'manifest', 'candidate', 'worker',
      ];
      schemaTypes.forEach(type => {
        expect(getCurrentVersion(type)).toBe(SCHEMA_VERSIONS[type]);
      });
    });
  });

  describe('needsMigration', () => {
    it('returns false for current version', () => {
      const data = { schemaVersion: 1 };
      expect(needsMigration(data, 'session')).toBe(false);
    });

    it('returns false for schemaVersion 0 (invalid version defaults to 1)', () => {
      // schemaVersion 0 is invalid - treated as legacy data defaulting to version 1
      // Since current version is 1, no migration is needed
      const data = { schemaVersion: 0 };
      expect(needsMigration(data, 'session')).toBe(false);
    });

    it('returns false for missing schemaVersion (defaults to 1)', () => {
      const data = { sessionId: 'test' };
      expect(needsMigration(data, 'session')).toBe(false);
    });
  });

  describe('migrateSchema', () => {
    it('updates schemaVersion to current', () => {
      const data = { schemaVersion: 1, sessionId: 'test' };
      const migrated = migrateSchema<typeof data>(data, 'session');
      expect(migrated.schemaVersion).toBe(SCHEMA_VERSIONS.session);
    });
  });

  describe('registerMigration', () => {
    it('rejects non-sequential version increment', () => {
      expect(() => {
        registerMigration('session', 1, 3, (data) => data);
      }).toThrow('Migration must increment version by 1');
    });
  });

  describe('hasMigration', () => {
    it('returns false for non-existent migration', () => {
      expect(hasMigration('session', 99, 100)).toBe(false);
    });
  });

  describe('loadAndMigrate', () => {
    it('parses and migrates JSON string', () => {
      const json = JSON.stringify({ schemaVersion: 1, test: 'value' });
      const result = loadAndMigrate<{ schemaVersion: number; test: string }>(json, 'session');
      expect(result.schemaVersion).toBe(SCHEMA_VERSIONS.session);
      expect(result.test).toBe('value');
    });
  });
});

// ============================================================================
// Atomic Write Tests
// ============================================================================

describe('Atomic Write', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'schema-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('atomicWriteJson', () => {
    it('writes JSON file atomically', async () => {
      const filePath = path.join(tempDir, 'test.json');
      const data = { schemaVersion: 1, test: 'value' };

      await atomicWriteJson(filePath, data);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(JSON.parse(content)).toEqual(data);
    });

    it('creates parent directories', async () => {
      const filePath = path.join(tempDir, 'nested', 'dir', 'test.json');
      const data = { test: 'value' };

      await atomicWriteJson(filePath, data);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(JSON.parse(content)).toEqual(data);
    });

    it('pretty-prints JSON with 2-space indent', async () => {
      const filePath = path.join(tempDir, 'test.json');
      const data = { a: 1, b: 2 };

      await atomicWriteJson(filePath, data);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe(JSON.stringify(data, null, 2));
    });
  });

  describe('loadMigrateAndSave', () => {
    it('loads and returns data without write-back when no migration needed', async () => {
      const filePath = path.join(tempDir, 'test.json');
      const data = { schemaVersion: 1, sessionId: 'test-session' };
      await fs.writeFile(filePath, JSON.stringify(data), 'utf-8');

      const result = await loadMigrateAndSave<typeof data>(filePath, 'session');

      expect(result.migrated).toBe(false);
      expect(result.data.sessionId).toBe('test-session');
    });
  });
});
