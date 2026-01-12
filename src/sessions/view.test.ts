/**
 * Tests for Session Viewing
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Session, RunConfig } from '../schemas/index.js';

// Mock session data
const mockSession: Session = {
  schemaVersion: 1,
  sessionId: '20260107-tokyo-adventure',
  title: 'Tokyo Adventure',
  destinations: ['Tokyo'],
  dateRange: { start: '2026-04-01', end: '2026-04-10' },
  flexibility: { type: 'none' },
  interests: ['temples'],
  createdAt: '2026-01-07T10:00:00.000Z',
};

// Mock run config
const mockRunConfig: RunConfig = {
  schemaVersion: 1,
  runId: '20260107-100000-full',
  sessionId: '20260107-tokyo-adventure',
  startedAt: '2026-01-07T10:00:00.000Z',
  completedAt: '2026-01-07T10:05:00.000Z',
  status: 'completed',
  mode: 'full',
  models: {
    enhancement: 'gemini-3-flash',
    router: 'gemini-3-flash',
    normalizer: 'gemini-3-flash',
    aggregator: 'gemini-3-flash',
    validator: 'gemini-3-flash',
  },
  promptVersions: {
    enhancement: 'v1',
    router: 'v1',
    aggregator: 'v1',
    youtubeExtraction: 'v1',
    validation: 'v1',
  },
  limits: {
    maxCandidatesPerWorker: 20,
    maxTopCandidates: 50,
    maxValidations: 10,
    workerTimeout: 30000,
  },
  flags: {
    skipEnhancement: false,
    skipValidation: false,
    skipYoutube: false,
  },
};

// Mock dependencies
jest.unstable_mockModule('../storage/sessions.js', () => ({
  loadSession: jest.fn<(sessionId: string) => Promise<Session>>()
    .mockResolvedValue(mockSession),
}));

jest.unstable_mockModule('../storage/runs.js', () => ({
  listRuns: jest.fn<(sessionId: string) => Promise<string[]>>()
    .mockResolvedValue(['20260107-100000-full']),
  loadRunConfig: jest.fn<(sessionId: string, runId: string) => Promise<RunConfig>>()
    .mockResolvedValue(mockRunConfig),
  getLatestRunId: jest.fn<(sessionId: string) => Promise<string | null>>()
    .mockResolvedValue('20260107-100000-full'),
}));

jest.unstable_mockModule('../storage/paths.js', () => ({
  getEnhancementFilePath: jest.fn((sessionId: string) => `/mock/sessions/${sessionId}/00_enhancement.json`),
}));

jest.unstable_mockModule('node:fs/promises', () => ({
  readFile: jest.fn<(path: string, encoding: string) => Promise<string>>()
    .mockRejectedValue(new Error('ENOENT')), // No enhancement by default
}));

// Dynamic imports
const { viewSession } = await import('./view.js');
const { loadSession } = await import('../storage/sessions.js');
const { listRuns, loadRunConfig } = await import('../storage/runs.js');
const fs = await import('node:fs/promises');

describe('viewSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return session details', async () => {
    const details = await viewSession('20260107-tokyo-adventure');

    expect(details.session).toEqual(mockSession);
    expect(details.session.title).toBe('Tokyo Adventure');
  });

  it('should include run history', async () => {
    const details = await viewSession('20260107-tokyo-adventure');

    expect(details.runs).toHaveLength(1);
    expect(details.runs[0].runId).toBe('20260107-100000-full');
    expect(details.runs[0].mode).toBe('full');
  });

  it('should build run summary from config', async () => {
    const details = await viewSession('20260107-tokyo-adventure');

    const run = details.runs[0];
    expect(run.startedAt).toBe('2026-01-07T10:00:00.000Z');
    expect(run.completedAt).toBe('2026-01-07T10:05:00.000Z');
    expect(run.success).toBe(true);
    expect(run.totalStages).toBe(11);
  });

  it('should include latest run ID', async () => {
    const details = await viewSession('20260107-tokyo-adventure');

    expect(details.latestRunId).toBe('20260107-100000-full');
  });

  it('should handle session with no runs', async () => {
    (listRuns as jest.MockedFunction<typeof listRuns>)
      .mockResolvedValueOnce([]);

    const details = await viewSession('20260107-tokyo-adventure');

    expect(details.runs).toHaveLength(0);
  });

  it('should handle missing run config gracefully', async () => {
    (loadRunConfig as jest.MockedFunction<typeof loadRunConfig>)
      .mockRejectedValueOnce(new Error('Config not found'));

    const details = await viewSession('20260107-tokyo-adventure');

    // Should still return a run summary with defaults
    expect(details.runs).toHaveLength(1);
    expect(details.runs[0].success).toBe(false);
  });

  it('should include enhancement result when available', async () => {
    const mockEnhancement = { enhanced: true, analysis: {} };
    (fs.readFile as jest.MockedFunction<typeof fs.readFile>)
      .mockResolvedValueOnce(JSON.stringify(mockEnhancement));

    const details = await viewSession('20260107-tokyo-adventure');

    expect(details.enhancementResult).toEqual(mockEnhancement);
  });

  it('should handle missing enhancement file', async () => {
    (fs.readFile as jest.MockedFunction<typeof fs.readFile>)
      .mockRejectedValueOnce(new Error('ENOENT'));

    const details = await viewSession('20260107-tokyo-adventure');

    expect(details.enhancementResult).toBeUndefined();
  });

  it('should throw for invalid session ID format', async () => {
    await expect(viewSession('nonexistent')).rejects.toThrow('Invalid session ID format');
  });

  it('should throw for non-existent session', async () => {
    (loadSession as jest.MockedFunction<typeof loadSession>)
      .mockRejectedValueOnce(new Error('Session not found'));

    await expect(viewSession('20260107-nonexistent')).rejects.toThrow('Session not found');
  });

  it('should handle from-stage mode correctly', async () => {
    const fromStageConfig: RunConfig = {
      ...mockRunConfig,
      runId: '20260107-110000-from-08',
      mode: 'from-stage',
      fromStage: '08',
      sourceRunId: '20260107-100000-full',
    };

    (listRuns as jest.MockedFunction<typeof listRuns>)
      .mockResolvedValueOnce(['20260107-110000-from-08']);
    (loadRunConfig as jest.MockedFunction<typeof loadRunConfig>)
      .mockResolvedValueOnce(fromStageConfig);

    const details = await viewSession('20260107-tokyo-adventure');

    expect(details.runs[0].mode).toBe('from-08');
  });
});
