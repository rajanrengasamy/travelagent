import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadTriage } from '../storage/triage.js';
import {
  setTriageStatus,
  getTriageStatus,
  listTriagedCandidates,
  clearTriage,
  removeTriageEntry,
  listByStatus,
  getTriageCounts,
} from './manager.js';

describe('triage manager', () => {
  let tempDir: string;
  const originalEnv = process.env.TRAVELAGENT_DATA_DIR;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'triage-manager-test-'));
    process.env.TRAVELAGENT_DATA_DIR = tempDir;
  });

  afterEach(async () => {
    process.env.TRAVELAGENT_DATA_DIR = originalEnv;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const testSessionId = '20260102-test-session';

  describe('setTriageStatus', () => {
    it('creates a new triage entry', async () => {
      await setTriageStatus(testSessionId, 'candidate-1', 'must');

      const entry = await getTriageStatus(testSessionId, 'candidate-1');
      expect(entry).not.toBeNull();
      expect(entry?.status).toBe('must');
    });

    it('sets triage status with notes', async () => {
      await setTriageStatus(testSessionId, 'candidate-1', 'research', 'Need more info');

      const entry = await getTriageStatus(testSessionId, 'candidate-1');
      expect(entry?.notes).toBe('Need more info');
    });

    it('updates existing entry status', async () => {
      await setTriageStatus(testSessionId, 'candidate-1', 'must');
      await setTriageStatus(testSessionId, 'candidate-1', 'maybe');

      const entry = await getTriageStatus(testSessionId, 'candidate-1');
      expect(entry?.status).toBe('maybe');
    });

    it('updates timestamp on changes', async () => {
      await setTriageStatus(testSessionId, 'candidate-1', 'must');
      const entry1 = await getTriageStatus(testSessionId, 'candidate-1');

      await new Promise((resolve) => setTimeout(resolve, 10));

      await setTriageStatus(testSessionId, 'candidate-1', 'research');
      const entry2 = await getTriageStatus(testSessionId, 'candidate-1');

      expect(entry2?.updatedAt).not.toBe(entry1?.updatedAt);
    });

    it('preserves other entries when updating', async () => {
      await setTriageStatus(testSessionId, 'candidate-1', 'must');
      await setTriageStatus(testSessionId, 'candidate-2', 'maybe');

      const entries = await listTriagedCandidates(testSessionId);
      expect(entries).toHaveLength(2);
    });
  });

  describe('getTriageStatus', () => {
    it('returns null for non-existent session', async () => {
      const entry = await getTriageStatus('non-existent', 'candidate-1');
      expect(entry).toBeNull();
    });

    it('returns null for non-triaged candidate', async () => {
      await setTriageStatus(testSessionId, 'candidate-1', 'must');
      const entry = await getTriageStatus(testSessionId, 'candidate-2');
      expect(entry).toBeNull();
    });

    it('returns entry for triaged candidate', async () => {
      await setTriageStatus(testSessionId, 'candidate-1', 'research', 'Test notes');

      const entry = await getTriageStatus(testSessionId, 'candidate-1');
      expect(entry).not.toBeNull();
      expect(entry?.candidateId).toBe('candidate-1');
      expect(entry?.status).toBe('research');
      expect(entry?.notes).toBe('Test notes');
    });
  });

  describe('listTriagedCandidates', () => {
    it('returns empty array for no triage state', async () => {
      const entries = await listTriagedCandidates(testSessionId);
      expect(entries).toEqual([]);
    });

    it('returns all triaged entries', async () => {
      await setTriageStatus(testSessionId, 'candidate-1', 'must');
      await setTriageStatus(testSessionId, 'candidate-2', 'research');
      await setTriageStatus(testSessionId, 'candidate-3', 'maybe');

      const entries = await listTriagedCandidates(testSessionId);
      expect(entries).toHaveLength(3);
      expect(entries.map((e) => e.candidateId).sort()).toEqual([
        'candidate-1',
        'candidate-2',
        'candidate-3',
      ]);
    });
  });

  describe('clearTriage', () => {
    it('clears all entries', async () => {
      await setTriageStatus(testSessionId, 'candidate-1', 'must');
      await setTriageStatus(testSessionId, 'candidate-2', 'research');

      await clearTriage(testSessionId);

      const entries = await listTriagedCandidates(testSessionId);
      expect(entries).toEqual([]);
    });

    it('works on non-existent session', async () => {
      await expect(clearTriage(testSessionId)).resolves.not.toThrow();

      const entries = await listTriagedCandidates(testSessionId);
      expect(entries).toEqual([]);
    });

    it('preserves session ID in cleared state', async () => {
      await clearTriage(testSessionId);

      const triage = await loadTriage(testSessionId);
      expect(triage?.sessionId).toBe(testSessionId);
    });
  });

  describe('removeTriageEntry', () => {
    it('removes existing entry', async () => {
      await setTriageStatus(testSessionId, 'candidate-1', 'must');
      await setTriageStatus(testSessionId, 'candidate-2', 'research');

      const removed = await removeTriageEntry(testSessionId, 'candidate-1');

      expect(removed).toBe(true);
      const entries = await listTriagedCandidates(testSessionId);
      expect(entries).toHaveLength(1);
      expect(entries[0].candidateId).toBe('candidate-2');
    });

    it('returns false for non-existent entry', async () => {
      await setTriageStatus(testSessionId, 'candidate-1', 'must');

      const removed = await removeTriageEntry(testSessionId, 'candidate-99');
      expect(removed).toBe(false);
    });

    it('returns false for non-existent session', async () => {
      const removed = await removeTriageEntry('non-existent', 'candidate-1');
      expect(removed).toBe(false);
    });

    it('updates timestamp on removal', async () => {
      await setTriageStatus(testSessionId, 'candidate-1', 'must');
      const before = await loadTriage(testSessionId);

      await new Promise((resolve) => setTimeout(resolve, 10));

      await removeTriageEntry(testSessionId, 'candidate-1');
      const after = await loadTriage(testSessionId);

      expect(after?.updatedAt).not.toBe(before?.updatedAt);
    });
  });

  describe('listByStatus', () => {
    beforeEach(async () => {
      await setTriageStatus(testSessionId, 'candidate-1', 'must');
      await setTriageStatus(testSessionId, 'candidate-2', 'research');
      await setTriageStatus(testSessionId, 'candidate-3', 'must');
      await setTriageStatus(testSessionId, 'candidate-4', 'maybe');
    });

    it('filters by must status', async () => {
      const entries = await listByStatus(testSessionId, 'must');
      expect(entries).toHaveLength(2);
      expect(entries.every((e) => e.status === 'must')).toBe(true);
    });

    it('filters by research status', async () => {
      const entries = await listByStatus(testSessionId, 'research');
      expect(entries).toHaveLength(1);
      expect(entries[0].candidateId).toBe('candidate-2');
    });

    it('filters by maybe status', async () => {
      const entries = await listByStatus(testSessionId, 'maybe');
      expect(entries).toHaveLength(1);
      expect(entries[0].candidateId).toBe('candidate-4');
    });

    it('returns empty array when no matches', async () => {
      await clearTriage(testSessionId);
      await setTriageStatus(testSessionId, 'candidate-1', 'must');

      const entries = await listByStatus(testSessionId, 'maybe');
      expect(entries).toEqual([]);
    });
  });

  describe('getTriageCounts', () => {
    it('returns zero counts for empty triage', async () => {
      const counts = await getTriageCounts(testSessionId);
      expect(counts).toEqual({
        must: 0,
        research: 0,
        maybe: 0,
        total: 0,
      });
    });

    it('counts entries by status', async () => {
      await setTriageStatus(testSessionId, 'candidate-1', 'must');
      await setTriageStatus(testSessionId, 'candidate-2', 'must');
      await setTriageStatus(testSessionId, 'candidate-3', 'research');
      await setTriageStatus(testSessionId, 'candidate-4', 'maybe');
      await setTriageStatus(testSessionId, 'candidate-5', 'maybe');
      await setTriageStatus(testSessionId, 'candidate-6', 'maybe');

      const counts = await getTriageCounts(testSessionId);
      expect(counts).toEqual({
        must: 2,
        research: 1,
        maybe: 3,
        total: 6,
      });
    });
  });
});
