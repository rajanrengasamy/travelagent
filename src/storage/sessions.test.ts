import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Session } from '../schemas/index.js';
import {
  saveSession,
  loadSession,
  listSessions,
  archiveSession,
  sessionExists,
} from './sessions.js';

describe('sessions storage', () => {
  let tempDir: string;
  const originalEnv = process.env.TRAVELAGENT_DATA_DIR;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sessions-test-'));
    process.env.TRAVELAGENT_DATA_DIR = tempDir;
  });

  afterEach(async () => {
    process.env.TRAVELAGENT_DATA_DIR = originalEnv;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function createTestSession(overrides?: Partial<Session>): Session {
    return {
      schemaVersion: 1,
      sessionId: '20260102-test-session',
      title: 'Test Session',
      destinations: ['Tokyo'],
      dateRange: { start: '2026-03-01', end: '2026-03-10' },
      flexibility: { type: 'none' },
      interests: ['food'],
      createdAt: new Date().toISOString(),
      ...overrides,
    };
  }

  describe('saveSession', () => {
    it('creates session.json file', async () => {
      const session = createTestSession();
      await saveSession(session);

      const filePath = path.join(
        tempDir,
        'sessions',
        session.sessionId,
        'session.json'
      );
      const content = await fs.readFile(filePath, 'utf-8');
      const saved = JSON.parse(content);

      expect(saved.sessionId).toBe(session.sessionId);
      expect(saved.title).toBe(session.title);
    });

    it('validates session data', async () => {
      const invalidSession = { sessionId: 'invalid' } as Session;
      await expect(saveSession(invalidSession)).rejects.toThrow();
    });

    it('creates parent directories', async () => {
      const session = createTestSession({
        sessionId: '20260103-nested-session',
      });
      await saveSession(session);

      const filePath = path.join(
        tempDir,
        'sessions',
        session.sessionId,
        'session.json'
      );
      expect(await fs.access(filePath).then(() => true).catch(() => false)).toBe(true);
    });
  });

  describe('loadSession', () => {
    it('returns valid session', async () => {
      const session = createTestSession();
      await saveSession(session);

      const loaded = await loadSession(session.sessionId);

      expect(loaded.sessionId).toBe(session.sessionId);
      expect(loaded.title).toBe(session.title);
      expect(loaded.destinations).toEqual(session.destinations);
    });

    it('throws for non-existent session', async () => {
      await expect(loadSession('nonexistent')).rejects.toThrow(
        /Session not found: nonexistent \(path: /
      );
    });

    it('throws for invalid session data', async () => {
      const sessionDir = path.join(tempDir, 'sessions', '20260102-invalid');
      await fs.mkdir(sessionDir, { recursive: true });
      await fs.writeFile(
        path.join(sessionDir, 'session.json'),
        '{"invalid": true}'
      );

      await expect(loadSession('20260102-invalid')).rejects.toThrow();
    });
  });

  describe('listSessions', () => {
    it('returns all sessions', async () => {
      const session1 = createTestSession({
        sessionId: '20260101-first',
        createdAt: '2026-01-01T10:00:00Z',
      });
      const session2 = createTestSession({
        sessionId: '20260102-second',
        createdAt: '2026-01-02T10:00:00Z',
      });

      await saveSession(session1);
      await saveSession(session2);

      const sessions = await listSessions();

      expect(sessions).toHaveLength(2);
    });

    it('filters archived sessions by default', async () => {
      const active = createTestSession({
        sessionId: '20260101-active',
        createdAt: '2026-01-01T10:00:00Z',
      });
      const archived = createTestSession({
        sessionId: '20260102-archived',
        createdAt: '2026-01-02T10:00:00Z',
        archivedAt: '2026-01-03T10:00:00Z',
      });

      await saveSession(active);
      await saveSession(archived);

      const sessions = await listSessions();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionId).toBe('20260101-active');
    });

    it('includes archived when requested', async () => {
      const active = createTestSession({
        sessionId: '20260101-active',
      });
      const archived = createTestSession({
        sessionId: '20260102-archived',
        archivedAt: '2026-01-03T10:00:00Z',
      });

      await saveSession(active);
      await saveSession(archived);

      const sessions = await listSessions({ includeArchived: true });

      expect(sessions).toHaveLength(2);
    });

    it('sorts by createdAt descending', async () => {
      const older = createTestSession({
        sessionId: '20260101-older',
        createdAt: '2026-01-01T10:00:00Z',
      });
      const newer = createTestSession({
        sessionId: '20260102-newer',
        createdAt: '2026-01-02T10:00:00Z',
      });

      await saveSession(older);
      await saveSession(newer);

      const sessions = await listSessions();

      expect(sessions[0].sessionId).toBe('20260102-newer');
      expect(sessions[1].sessionId).toBe('20260101-older');
    });

    it('returns empty array when no sessions', async () => {
      const sessions = await listSessions();
      expect(sessions).toEqual([]);
    });

    it('skips invalid session directories', async () => {
      const valid = createTestSession({
        sessionId: '20260101-valid',
      });
      await saveSession(valid);

      // Create invalid directory without session.json
      const invalidDir = path.join(tempDir, 'sessions', '20260102-invalid');
      await fs.mkdir(invalidDir, { recursive: true });

      const sessions = await listSessions();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionId).toBe('20260101-valid');
    });
  });

  describe('archiveSession', () => {
    it('sets archivedAt timestamp', async () => {
      const session = createTestSession();
      await saveSession(session);

      await archiveSession(session.sessionId);

      const loaded = await loadSession(session.sessionId);
      expect(loaded.archivedAt).toBeDefined();
    });

    it('throws for non-existent session', async () => {
      await expect(archiveSession('nonexistent')).rejects.toThrow(
        'Session not found'
      );
    });
  });

  describe('sessionExists', () => {
    it('returns true for existing session', async () => {
      const session = createTestSession();
      await saveSession(session);

      expect(await sessionExists(session.sessionId)).toBe(true);
    });

    it('returns false for non-existent session', async () => {
      expect(await sessionExists('nonexistent')).toBe(false);
    });
  });
});
