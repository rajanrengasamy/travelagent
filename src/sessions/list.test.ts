/**
 * Tests for Session Listing
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Session } from '../schemas/index.js';

// Create mock sessions
const mockSessions: Session[] = [
  {
    schemaVersion: 1,
    sessionId: '20260107-tokyo-adventure',
    title: 'Tokyo Adventure',
    destinations: ['Tokyo'],
    dateRange: { start: '2026-04-01', end: '2026-04-10' },
    flexibility: { type: 'none' },
    interests: ['temples'],
    createdAt: '2026-01-07T10:00:00.000Z',
  },
  {
    schemaVersion: 1,
    sessionId: '20260106-kyoto-trip',
    title: 'Kyoto Trip',
    destinations: ['Kyoto'],
    dateRange: { start: '2026-05-01', end: '2026-05-07' },
    flexibility: { type: 'none' },
    interests: ['food'],
    createdAt: '2026-01-06T10:00:00.000Z',
    archivedAt: '2026-01-07T12:00:00.000Z',
  },
  {
    schemaVersion: 1,
    sessionId: '20260105-osaka-food',
    title: 'Osaka Food Tour',
    destinations: ['Osaka'],
    dateRange: { start: '2026-06-01', end: '2026-06-05' },
    flexibility: { type: 'none' },
    interests: ['food', 'nightlife'],
    createdAt: '2026-01-05T10:00:00.000Z',
  },
];

// Mock the dependencies
jest.unstable_mockModule('../storage/sessions.js', () => ({
  listSessions: jest.fn<(options?: { includeArchived?: boolean }) => Promise<Session[]>>()
    .mockImplementation(async (options) => {
      if (options?.includeArchived) {
        return mockSessions;
      }
      return mockSessions.filter(s => !s.archivedAt);
    }),
}));

jest.unstable_mockModule('../storage/runs.js', () => ({
  listRuns: jest.fn<(sessionId: string) => Promise<string[]>>()
    .mockImplementation(async (sessionId) => {
      // Return different run counts for different sessions
      if (sessionId === '20260107-tokyo-adventure') {
        return ['20260107-100000-full', '20260107-110000-full'];
      }
      if (sessionId === '20260105-osaka-food') {
        return ['20260105-100000-full'];
      }
      return [];
    }),
}));

// Dynamic imports after mocking
const { listSessions, getSessionCount } = await import('./list.js');

describe('listSessions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return session summaries', async () => {
    const summaries = await listSessions();

    expect(summaries.length).toBe(2); // Excludes archived by default
    expect(summaries[0]).toHaveProperty('sessionId');
    expect(summaries[0]).toHaveProperty('title');
    expect(summaries[0]).toHaveProperty('destinations');
    expect(summaries[0]).toHaveProperty('createdAt');
    expect(summaries[0]).toHaveProperty('runCount');
  });

  it('should exclude archived sessions by default', async () => {
    const summaries = await listSessions();

    expect(summaries.length).toBe(2);
    expect(summaries.some(s => s.sessionId === '20260106-kyoto-trip')).toBe(false);
  });

  it('should include archived sessions when requested', async () => {
    const summaries = await listSessions({ includeArchived: true });

    expect(summaries.length).toBe(3);
    expect(summaries.some(s => s.sessionId === '20260106-kyoto-trip')).toBe(true);
  });

  it('should include run counts', async () => {
    const summaries = await listSessions();

    const tokyo = summaries.find(s => s.sessionId === '20260107-tokyo-adventure');
    const osaka = summaries.find(s => s.sessionId === '20260105-osaka-food');

    expect(tokyo?.runCount).toBe(2);
    expect(osaka?.runCount).toBe(1);
  });

  it('should sort by createdAt descending by default', async () => {
    const summaries = await listSessions();

    expect(summaries[0].sessionId).toBe('20260107-tokyo-adventure');
    expect(summaries[1].sessionId).toBe('20260105-osaka-food');
  });

  it('should sort ascending when requested', async () => {
    const summaries = await listSessions({ sortOrder: 'asc' });

    expect(summaries[0].sessionId).toBe('20260105-osaka-food');
    expect(summaries[1].sessionId).toBe('20260107-tokyo-adventure');
  });

  it('should respect limit', async () => {
    const summaries = await listSessions({ limit: 1 });

    expect(summaries.length).toBe(1);
    expect(summaries[0].sessionId).toBe('20260107-tokyo-adventure');
  });

  it('should include lastRunId from runs', async () => {
    const summaries = await listSessions();

    const tokyo = summaries.find(s => s.sessionId === '20260107-tokyo-adventure');
    expect(tokyo?.lastRunId).toBe('20260107-100000-full');
  });

  it('should handle sessions with no runs', async () => {
    const summaries = await listSessions({ includeArchived: true });

    const kyoto = summaries.find(s => s.sessionId === '20260106-kyoto-trip');
    expect(kyoto?.runCount).toBe(0);
    expect(kyoto?.lastRunId).toBeUndefined();
  });
});

describe('getSessionCount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return count of active sessions', async () => {
    const count = await getSessionCount();
    expect(count).toBe(2);
  });

  it('should include archived in count when requested', async () => {
    const count = await getSessionCount({ includeArchived: true });
    expect(count).toBe(3);
  });
});
