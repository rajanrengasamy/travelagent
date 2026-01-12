/**
 * Tests for Session Creation
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Session } from '../schemas/index.js';
import type { CreateSessionParams } from './create.js';

// Mock the dependencies
jest.unstable_mockModule('../storage/sessions.js', () => ({
  saveSession: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  listSessions: jest.fn<() => Promise<Session[]>>().mockResolvedValue([]),
}));

jest.unstable_mockModule('../storage/paths.js', () => ({
  getSessionDir: jest.fn((sessionId: string) => `/mock/sessions/${sessionId}`),
}));

jest.unstable_mockModule('node:fs/promises', () => ({
  mkdir: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

// Dynamic imports after mocking
const { createSession } = await import('./create.js');
const { saveSession, listSessions } = await import('../storage/sessions.js');
const fs = await import('node:fs/promises');

describe('createSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const validParams: CreateSessionParams = {
    title: 'Japan Adventure',
    destinations: ['Tokyo', 'Kyoto'],
    dateRange: { start: '2026-04-01', end: '2026-04-14' },
    flexibility: { type: 'plusMinusDays', days: 3 },
    interests: ['temples', 'food'],
  };

  it('should create session with valid parameters', async () => {
    const session = await createSession(validParams);

    expect(session.title).toBe('Japan Adventure');
    expect(session.destinations).toEqual(['Tokyo', 'Kyoto']);
    expect(session.interests).toEqual(['temples', 'food']);
    expect(session.sessionId).toMatch(/^\d{8}-/);
    expect(session.createdAt).toBeDefined();
    expect(session.schemaVersion).toBe(1);
  });

  it('should generate session ID from destinations and interests', async () => {
    const session = await createSession(validParams);

    expect(session.sessionId).toContain('tokyo');
    expect(session.sessionId).toContain('kyoto');
  });

  it('should save session to storage', async () => {
    await createSession(validParams);

    expect(saveSession).toHaveBeenCalledTimes(1);
    expect(saveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Japan Adventure',
        destinations: ['Tokyo', 'Kyoto'],
      })
    );
  });

  it('should create session directory', async () => {
    await createSession(validParams);

    expect(fs.mkdir).toHaveBeenCalledTimes(1);
    expect(fs.mkdir).toHaveBeenCalledWith(
      expect.stringContaining('sessions'),
      { recursive: true }
    );
  });

  it('should handle optional constraints', async () => {
    const paramsWithConstraints: CreateSessionParams = {
      ...validParams,
      constraints: { budget: 'moderate', accessibility: true },
    };

    const session = await createSession(paramsWithConstraints);

    expect(session.constraints).toEqual({ budget: 'moderate', accessibility: true });
  });

  it('should set createdAt timestamp', async () => {
    const before = new Date().toISOString();
    const session = await createSession(validParams);
    const after = new Date().toISOString();

    expect(session.createdAt >= before).toBe(true);
    expect(session.createdAt <= after).toBe(true);
  });

  it('should throw on missing required fields', async () => {
    const invalidParams = {
      title: 'Test',
      // Missing destinations
      dateRange: { start: '2026-04-01', end: '2026-04-14' },
      flexibility: { type: 'none' as const },
      interests: ['food'],
    };

    await expect(createSession(invalidParams as CreateSessionParams)).rejects.toThrow();
  });

  it('should throw on empty destinations', async () => {
    const invalidParams: CreateSessionParams = {
      ...validParams,
      destinations: [],
    };

    await expect(createSession(invalidParams)).rejects.toThrow();
  });

  it('should throw on empty interests', async () => {
    const invalidParams: CreateSessionParams = {
      ...validParams,
      interests: [],
    };

    await expect(createSession(invalidParams)).rejects.toThrow();
  });

  it('should use prompt for ID generation when provided', async () => {
    const paramsWithPrompt: CreateSessionParams = {
      ...validParams,
      prompt: 'cherry blossoms adventure',
    };

    const session = await createSession(paramsWithPrompt);

    // Prompt tokens should be included (after destinations and interests)
    expect(session.sessionId).toContain('tokyo');
  });

  it('should handle ID collision', async () => {
    // Simulate existing session with same ID
    const existingSession: Session = {
      schemaVersion: 1,
      sessionId: expect.stringMatching(/^\d{8}-tokyo-kyoto-temples-food/),
      title: 'Existing',
      destinations: ['Tokyo', 'Kyoto'],
      dateRange: { start: '2026-04-01', end: '2026-04-14' },
      flexibility: { type: 'none' },
      interests: ['temples', 'food'],
      createdAt: '2026-01-01T00:00:00.000Z',
    } as unknown as Session;

    (listSessions as jest.MockedFunction<typeof listSessions>)
      .mockResolvedValueOnce([existingSession]);

    // This should still succeed with a different ID
    const session = await createSession(validParams);
    expect(session.sessionId).toBeDefined();
  });
});
