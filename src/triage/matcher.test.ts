import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Candidate } from '../schemas/index.js';
import type { TriageState } from '../schemas/triage.js';
import { saveTriage, loadTriage } from '../storage/triage.js';
import {
  generateTitleLocationHash,
  hashCandidate,
  matchCandidateAcrossRuns,
  buildCandidateHashMap,
  migrateTriageEntries,
  reconcileTriageState,
} from './matcher.js';

describe('triage matcher', () => {
  let tempDir: string;
  const originalEnv = process.env.TRAVELAGENT_DATA_DIR;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'triage-matcher-test-'));
    process.env.TRAVELAGENT_DATA_DIR = tempDir;
  });

  afterEach(async () => {
    process.env.TRAVELAGENT_DATA_DIR = originalEnv;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const testSessionId = '20260102-test-session';

  function createTestCandidate(overrides?: Partial<Candidate>): Candidate {
    return {
      candidateId: 'test-candidate-1',
      type: 'food',
      title: 'Test Restaurant',
      summary: 'A great test restaurant',
      locationText: 'Paris, France',
      tags: ['food', 'test'],
      origin: 'web',
      sourceRefs: [{ url: 'https://example.com', retrievedAt: new Date().toISOString() }],
      confidence: 'high',
      score: 85,
      ...overrides,
    };
  }

  function createTestTriageState(
    overrides?: Partial<TriageState>
  ): TriageState {
    return {
      schemaVersion: 1,
      sessionId: testSessionId,
      entries: [],
      updatedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  describe('generateTitleLocationHash', () => {
    it('generates consistent hash for same input', () => {
      const hash1 = generateTitleLocationHash('Test Title', 'Paris');
      const hash2 = generateTitleLocationHash('Test Title', 'Paris');
      expect(hash1).toBe(hash2);
    });

    it('generates different hashes for different titles', () => {
      const hash1 = generateTitleLocationHash('Title A', 'Paris');
      const hash2 = generateTitleLocationHash('Title B', 'Paris');
      expect(hash1).not.toBe(hash2);
    });

    it('generates different hashes for different locations', () => {
      const hash1 = generateTitleLocationHash('Test Title', 'Paris');
      const hash2 = generateTitleLocationHash('Test Title', 'London');
      expect(hash1).not.toBe(hash2);
    });

    it('normalizes whitespace', () => {
      const hash1 = generateTitleLocationHash('Test  Title', 'Paris');
      const hash2 = generateTitleLocationHash('Test Title', 'Paris');
      expect(hash1).toBe(hash2);
    });

    it('normalizes case', () => {
      const hash1 = generateTitleLocationHash('TEST TITLE', 'PARIS');
      const hash2 = generateTitleLocationHash('test title', 'paris');
      expect(hash1).toBe(hash2);
    });

    it('handles undefined location', () => {
      const hash1 = generateTitleLocationHash('Test Title');
      const hash2 = generateTitleLocationHash('Test Title', undefined);
      expect(hash1).toBe(hash2);
    });

    it('generates 16-character hex hash', () => {
      const hash = generateTitleLocationHash('Test Title', 'Paris');
      expect(hash).toHaveLength(16);
      expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
    });
  });

  describe('hashCandidate', () => {
    it('uses title and locationText', () => {
      const candidate = createTestCandidate({
        title: 'Test Restaurant',
        locationText: 'Paris, France',
      });
      const hash = hashCandidate(candidate);
      const expectedHash = generateTitleLocationHash('Test Restaurant', 'Paris, France');
      expect(hash).toBe(expectedHash);
    });

    it('handles candidate without location', () => {
      const candidate = createTestCandidate({
        title: 'Test Restaurant',
        locationText: undefined,
      });
      expect(() => hashCandidate(candidate)).not.toThrow();
    });
  });

  describe('buildCandidateHashMap', () => {
    it('builds map of candidateId to hash', () => {
      const candidates = [
        createTestCandidate({ candidateId: 'c1', title: 'Title 1' }),
        createTestCandidate({ candidateId: 'c2', title: 'Title 2' }),
      ];

      const hashMap = buildCandidateHashMap(candidates);

      expect(hashMap.size).toBe(2);
      expect(hashMap.has('c1')).toBe(true);
      expect(hashMap.has('c2')).toBe(true);
    });

    it('returns empty map for empty array', () => {
      const hashMap = buildCandidateHashMap([]);
      expect(hashMap.size).toBe(0);
    });
  });

  describe('matchCandidateAcrossRuns', () => {
    it('returns null for no triage state', async () => {
      const result = await matchCandidateAcrossRuns(
        testSessionId,
        'candidate-1',
        'somehash'
      );
      expect(result).toBeNull();
    });

    it('returns null for empty entries', async () => {
      await saveTriage(testSessionId, createTestTriageState());

      const result = await matchCandidateAcrossRuns(
        testSessionId,
        'candidate-1',
        'somehash'
      );
      expect(result).toBeNull();
    });

    it('matches by exact candidateId', async () => {
      const triage = createTestTriageState({
        entries: [
          {
            candidateId: 'existing-candidate',
            status: 'must',
            updatedAt: new Date().toISOString(),
          },
        ],
      });
      await saveTriage(testSessionId, triage);

      const result = await matchCandidateAcrossRuns(
        testSessionId,
        'existing-candidate',
        'anyhash'
      );
      expect(result).toBe('existing-candidate');
    });

    it('falls back to hash matching', async () => {
      const triage = createTestTriageState({
        entries: [
          {
            candidateId: 'old-id',
            status: 'research',
            updatedAt: new Date().toISOString(),
          },
        ],
      });
      await saveTriage(testSessionId, triage);

      const existingHashes = new Map([['old-id', 'matchinghash']]);

      const result = await matchCandidateAcrossRuns(
        testSessionId,
        'new-id',
        'matchinghash',
        existingHashes
      );
      expect(result).toBe('old-id');
    });

    it('returns null when no hash match found', async () => {
      const triage = createTestTriageState({
        entries: [
          {
            candidateId: 'old-id',
            status: 'maybe',
            updatedAt: new Date().toISOString(),
          },
        ],
      });
      await saveTriage(testSessionId, triage);

      const existingHashes = new Map([['old-id', 'differenthash']]);

      const result = await matchCandidateAcrossRuns(
        testSessionId,
        'new-id',
        'nomatching',
        existingHashes
      );
      expect(result).toBeNull();
    });
  });

  describe('migrateTriageEntries', () => {
    it('returns 0 for no triage state', async () => {
      const result = await migrateTriageEntries(
        testSessionId,
        new Map([['old', 'new']])
      );
      expect(result).toBe(0);
    });

    it('returns 0 for empty entries', async () => {
      await saveTriage(testSessionId, createTestTriageState());

      const result = await migrateTriageEntries(
        testSessionId,
        new Map([['old', 'new']])
      );
      expect(result).toBe(0);
    });

    it('migrates matching entries', async () => {
      const triage = createTestTriageState({
        entries: [
          {
            candidateId: 'old-id-1',
            status: 'must',
            updatedAt: new Date().toISOString(),
          },
          {
            candidateId: 'old-id-2',
            status: 'research',
            updatedAt: new Date().toISOString(),
          },
        ],
      });
      await saveTriage(testSessionId, triage);

      const result = await migrateTriageEntries(
        testSessionId,
        new Map([
          ['old-id-1', 'new-id-1'],
          ['old-id-2', 'new-id-2'],
        ])
      );

      expect(result).toBe(2);

      const updated = await loadTriage(testSessionId);
      expect(updated?.entries[0].candidateId).toBe('new-id-1');
      expect(updated?.entries[1].candidateId).toBe('new-id-2');
    });

    it('only migrates entries in the map', async () => {
      const triage = createTestTriageState({
        entries: [
          {
            candidateId: 'old-id-1',
            status: 'must',
            updatedAt: new Date().toISOString(),
          },
          {
            candidateId: 'keep-id',
            status: 'research',
            updatedAt: new Date().toISOString(),
          },
        ],
      });
      await saveTriage(testSessionId, triage);

      const result = await migrateTriageEntries(
        testSessionId,
        new Map([['old-id-1', 'new-id-1']])
      );

      expect(result).toBe(1);

      const updated = await loadTriage(testSessionId);
      expect(updated?.entries.find((e) => e.candidateId === 'new-id-1')).toBeDefined();
      expect(updated?.entries.find((e) => e.candidateId === 'keep-id')).toBeDefined();
    });

    it('updates timestamps on migrated entries', async () => {
      const oldTimestamp = '2026-01-01T00:00:00.000Z';
      const triage = createTestTriageState({
        entries: [
          {
            candidateId: 'old-id',
            status: 'must',
            updatedAt: oldTimestamp,
          },
        ],
      });
      await saveTriage(testSessionId, triage);

      await migrateTriageEntries(testSessionId, new Map([['old-id', 'new-id']]));

      const updated = await loadTriage(testSessionId);
      expect(updated?.entries[0].updatedAt).not.toBe(oldTimestamp);
    });
  });

  describe('reconcileTriageState', () => {
    it('returns empty map for no triage state', async () => {
      const newCandidates = [createTestCandidate({ candidateId: 'c1' })];
      const previousCandidates = [createTestCandidate({ candidateId: 'c1' })];

      const result = await reconcileTriageState(
        testSessionId,
        newCandidates,
        previousCandidates
      );

      expect(result.size).toBe(0);
    });

    it('returns empty map for empty entries', async () => {
      await saveTriage(testSessionId, createTestTriageState());

      const newCandidates = [createTestCandidate({ candidateId: 'c1' })];
      const previousCandidates = [createTestCandidate({ candidateId: 'c1' })];

      const result = await reconcileTriageState(
        testSessionId,
        newCandidates,
        previousCandidates
      );

      expect(result.size).toBe(0);
    });

    it('matches by exact candidateId', async () => {
      const triage = createTestTriageState({
        entries: [
          {
            candidateId: 'c1',
            status: 'must',
            updatedAt: new Date().toISOString(),
          },
        ],
      });
      await saveTriage(testSessionId, triage);

      const newCandidates = [createTestCandidate({ candidateId: 'c1' })];
      const previousCandidates = [createTestCandidate({ candidateId: 'c1' })];

      const result = await reconcileTriageState(
        testSessionId,
        newCandidates,
        previousCandidates
      );

      expect(result.size).toBe(1);
      expect(result.get('c1')?.status).toBe('must');
    });

    it('matches by hash when candidateId changes', async () => {
      const triage = createTestTriageState({
        entries: [
          {
            candidateId: 'old-id',
            status: 'research',
            updatedAt: new Date().toISOString(),
          },
        ],
      });
      await saveTriage(testSessionId, triage);

      // Same title/location, different IDs
      const previousCandidates = [
        createTestCandidate({
          candidateId: 'old-id',
          title: 'Same Place',
          locationText: 'Same Location',
        }),
      ];
      const newCandidates = [
        createTestCandidate({
          candidateId: 'new-id',
          title: 'Same Place',
          locationText: 'Same Location',
        }),
      ];

      const result = await reconcileTriageState(
        testSessionId,
        newCandidates,
        previousCandidates
      );

      expect(result.size).toBe(1);
      expect(result.get('new-id')?.status).toBe('research');
    });

    it('does not match when title/location differ', async () => {
      const triage = createTestTriageState({
        entries: [
          {
            candidateId: 'old-id',
            status: 'maybe',
            updatedAt: new Date().toISOString(),
          },
        ],
      });
      await saveTriage(testSessionId, triage);

      const previousCandidates = [
        createTestCandidate({
          candidateId: 'old-id',
          title: 'Old Place',
          locationText: 'Old Location',
        }),
      ];
      const newCandidates = [
        createTestCandidate({
          candidateId: 'new-id',
          title: 'Different Place',
          locationText: 'Different Location',
        }),
      ];

      const result = await reconcileTriageState(
        testSessionId,
        newCandidates,
        previousCandidates
      );

      expect(result.size).toBe(0);
    });

    it('handles multiple candidates', async () => {
      const triage = createTestTriageState({
        entries: [
          {
            candidateId: 'c1',
            status: 'must',
            updatedAt: new Date().toISOString(),
          },
          {
            candidateId: 'c2',
            status: 'research',
            updatedAt: new Date().toISOString(),
          },
        ],
      });
      await saveTriage(testSessionId, triage);

      const previousCandidates = [
        createTestCandidate({ candidateId: 'c1', title: 'Place 1' }),
        createTestCandidate({ candidateId: 'c2', title: 'Place 2' }),
      ];
      const newCandidates = [
        createTestCandidate({ candidateId: 'c1', title: 'Place 1' }),
        createTestCandidate({ candidateId: 'c2', title: 'Place 2' }),
        createTestCandidate({ candidateId: 'c3', title: 'New Place' }),
      ];

      const result = await reconcileTriageState(
        testSessionId,
        newCandidates,
        previousCandidates
      );

      expect(result.size).toBe(2);
      expect(result.get('c1')?.status).toBe('must');
      expect(result.get('c2')?.status).toBe('research');
      expect(result.has('c3')).toBe(false); // New candidate, no existing triage
    });
  });
});
