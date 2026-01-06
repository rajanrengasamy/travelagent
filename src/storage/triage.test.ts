import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { TriageState, TriageEntry } from '../schemas/index.js';
import { saveTriage, loadTriage, updateTriageEntry } from './triage.js';
import { getTriageFilePath } from './paths.js';

describe('triage storage', () => {
  let tempDir: string;
  const originalEnv = process.env.TRAVELAGENT_DATA_DIR;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'triage-test-'));
    process.env.TRAVELAGENT_DATA_DIR = tempDir;
  });

  afterEach(async () => {
    process.env.TRAVELAGENT_DATA_DIR = originalEnv;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const testSessionId = '20260102-test-session';

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

  function createTestEntry(overrides?: Partial<TriageEntry>): TriageEntry {
    return {
      candidateId: 'candidate-1',
      status: 'must',
      updatedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  describe('saveTriage', () => {
    it('creates triage.json file', async () => {
      const triage = createTestTriageState();
      await saveTriage(testSessionId, triage);

      const filePath = getTriageFilePath(testSessionId);
      const content = await fs.readFile(filePath, 'utf-8');
      const saved = JSON.parse(content);

      expect(saved.sessionId).toBe(testSessionId);
      expect(saved.entries).toEqual([]);
    });

    it('validates triage data', async () => {
      const invalidTriage = { sessionId: testSessionId } as TriageState;
      await expect(saveTriage(testSessionId, invalidTriage)).rejects.toThrow();
    });

    it('saves entries', async () => {
      const triage = createTestTriageState({
        entries: [createTestEntry()],
      });
      await saveTriage(testSessionId, triage);

      const loaded = await loadTriage(testSessionId);
      expect(loaded?.entries).toHaveLength(1);
      expect(loaded?.entries[0].candidateId).toBe('candidate-1');
    });
  });

  describe('loadTriage', () => {
    it('returns triage state', async () => {
      const triage = createTestTriageState({
        entries: [createTestEntry({ status: 'research' })],
      });
      await saveTriage(testSessionId, triage);

      const loaded = await loadTriage(testSessionId);

      expect(loaded?.sessionId).toBe(testSessionId);
      expect(loaded?.entries[0].status).toBe('research');
    });

    it('returns null when file does not exist', async () => {
      const loaded = await loadTriage(testSessionId);
      expect(loaded).toBeNull();
    });

    it('throws for invalid data', async () => {
      const filePath = getTriageFilePath(testSessionId);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, '{"invalid": true}');

      await expect(loadTriage(testSessionId)).rejects.toThrow();
    });
  });

  describe('updateTriageEntry', () => {
    it('adds new entry', async () => {
      const entry = createTestEntry({ candidateId: 'new-candidate' });
      await updateTriageEntry(testSessionId, entry);

      const loaded = await loadTriage(testSessionId);
      expect(loaded?.entries).toHaveLength(1);
      expect(loaded?.entries[0].candidateId).toBe('new-candidate');
    });

    it('updates existing entry', async () => {
      const entry1 = createTestEntry({
        candidateId: 'candidate-1',
        status: 'must',
      });
      await updateTriageEntry(testSessionId, entry1);

      const entry2 = createTestEntry({
        candidateId: 'candidate-1',
        status: 'maybe',
      });
      await updateTriageEntry(testSessionId, entry2);

      const loaded = await loadTriage(testSessionId);
      expect(loaded?.entries).toHaveLength(1);
      expect(loaded?.entries[0].status).toBe('maybe');
    });

    it('creates triage file if none exists', async () => {
      const entry = createTestEntry();
      await updateTriageEntry(testSessionId, entry);

      const loaded = await loadTriage(testSessionId);
      expect(loaded).not.toBeNull();
      expect(loaded?.entries).toHaveLength(1);
    });

    it('preserves other entries when updating', async () => {
      const entry1 = createTestEntry({ candidateId: 'candidate-1' });
      const entry2 = createTestEntry({ candidateId: 'candidate-2' });

      await updateTriageEntry(testSessionId, entry1);
      await updateTriageEntry(testSessionId, entry2);

      const loaded = await loadTriage(testSessionId);
      expect(loaded?.entries).toHaveLength(2);
    });

    it('validates entry data', async () => {
      const invalidEntry = { candidateId: '' } as TriageEntry;
      await expect(
        updateTriageEntry(testSessionId, invalidEntry)
      ).rejects.toThrow();
    });

    it('updates triage timestamp', async () => {
      const entry1 = createTestEntry({
        updatedAt: '2026-01-01T00:00:00Z',
      });
      await updateTriageEntry(testSessionId, entry1);

      const loaded1 = await loadTriage(testSessionId);
      const firstTimestamp = loaded1?.updatedAt;

      // Wait a tiny bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      const entry2 = createTestEntry({
        candidateId: 'candidate-2',
      });
      await updateTriageEntry(testSessionId, entry2);

      const loaded2 = await loadTriage(testSessionId);
      expect(loaded2?.updatedAt).not.toBe(firstTimestamp);
    });
  });
});
