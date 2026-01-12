/**
 * Tests for Session Archiving
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Session } from '../schemas/index.js';

// Mock session data
const createMockSession = (archived = false): Session => ({
  schemaVersion: 1,
  sessionId: '20260107-tokyo-adventure',
  title: 'Tokyo Adventure',
  destinations: ['Tokyo'],
  dateRange: { start: '2026-04-01', end: '2026-04-10' },
  flexibility: { type: 'none' },
  interests: ['temples'],
  createdAt: '2026-01-07T10:00:00.000Z',
  ...(archived ? { archivedAt: '2026-01-08T10:00:00.000Z' } : {}),
});

// Track saved sessions
let savedSession: Session | null = null;

// Mock dependencies
jest.unstable_mockModule('../storage/sessions.js', () => ({
  loadSession: jest.fn<(sessionId: string) => Promise<Session>>()
    .mockImplementation(async () => createMockSession()),
  saveSession: jest.fn<(session: Session) => Promise<void>>()
    .mockImplementation(async (session) => {
      savedSession = session;
    }),
}));

// Dynamic imports
const { archiveSession, unarchiveSession, isArchived } = await import('./archive.js');
const { loadSession, saveSession } = await import('../storage/sessions.js');

describe('archiveSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    savedSession = null;
  });

  it('should set archivedAt timestamp', async () => {
    const before = new Date().toISOString();
    await archiveSession('20260107-tokyo-adventure');
    const after = new Date().toISOString();

    expect(saveSession).toHaveBeenCalled();
    expect(savedSession?.archivedAt).toBeDefined();
    expect(savedSession!.archivedAt! >= before).toBe(true);
    expect(savedSession!.archivedAt! <= after).toBe(true);
  });

  it('should load the session first', async () => {
    await archiveSession('20260107-tokyo-adventure');

    expect(loadSession).toHaveBeenCalledWith('20260107-tokyo-adventure');
  });

  it('should be idempotent (archive already archived)', async () => {
    // Mock an already archived session
    (loadSession as jest.MockedFunction<typeof loadSession>)
      .mockResolvedValueOnce(createMockSession(true));

    const before = new Date().toISOString();
    await archiveSession('20260107-tokyo-adventure');
    const after = new Date().toISOString();

    // Should update the timestamp
    expect(savedSession?.archivedAt).toBeDefined();
    expect(savedSession!.archivedAt! >= before).toBe(true);
    expect(savedSession!.archivedAt! <= after).toBe(true);
  });

  it('should throw for invalid session ID format', async () => {
    await expect(archiveSession('nonexistent')).rejects.toThrow('Invalid session ID format');
  });

  it('should throw for non-existent session', async () => {
    (loadSession as jest.MockedFunction<typeof loadSession>)
      .mockRejectedValueOnce(new Error('Session not found'));

    await expect(archiveSession('20260107-nonexistent')).rejects.toThrow('Session not found');
  });
});

describe('unarchiveSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    savedSession = null;
  });

  it('should remove archivedAt', async () => {
    // Mock an archived session
    (loadSession as jest.MockedFunction<typeof loadSession>)
      .mockResolvedValueOnce(createMockSession(true));

    await unarchiveSession('20260107-tokyo-adventure');

    expect(saveSession).toHaveBeenCalled();
    expect(savedSession?.archivedAt).toBeUndefined();
  });

  it('should be idempotent (unarchive already active)', async () => {
    // Mock an active (non-archived) session
    (loadSession as jest.MockedFunction<typeof loadSession>)
      .mockResolvedValueOnce(createMockSession(false));

    await unarchiveSession('20260107-tokyo-adventure');

    expect(savedSession?.archivedAt).toBeUndefined();
  });

  it('should throw for invalid session ID format', async () => {
    await expect(unarchiveSession('nonexistent')).rejects.toThrow('Invalid session ID format');
  });

  it('should throw for non-existent session', async () => {
    (loadSession as jest.MockedFunction<typeof loadSession>)
      .mockRejectedValueOnce(new Error('Session not found'));

    await expect(unarchiveSession('20260107-nonexistent')).rejects.toThrow('Session not found');
  });
});

describe('isArchived', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return true for archived session', async () => {
    (loadSession as jest.MockedFunction<typeof loadSession>)
      .mockResolvedValueOnce(createMockSession(true));

    const result = await isArchived('20260107-tokyo-adventure');

    expect(result).toBe(true);
  });

  it('should return false for active session', async () => {
    (loadSession as jest.MockedFunction<typeof loadSession>)
      .mockResolvedValueOnce(createMockSession(false));

    const result = await isArchived('20260107-tokyo-adventure');

    expect(result).toBe(false);
  });

  it('should throw for non-existent session', async () => {
    (loadSession as jest.MockedFunction<typeof loadSession>)
      .mockRejectedValueOnce(new Error('Session not found'));

    await expect(isArchived('20260107-nonexistent')).rejects.toThrow('Session not found');
  });
});
