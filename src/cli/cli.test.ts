/**
 * CLI Smoke Tests
 *
 * Basic tests to verify the CLI framework is set up correctly.
 * Tests cover:
 * - Program creation and configuration
 * - Global options parsing
 * - Command registration
 * - Base command functionality
 * - Formatter utilities
 *
 * @module cli/cli.test
 * @see Task 22.7 - CLI Smoke Tests
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createProgram } from './index.js';
import { BaseCommand, EXIT_CODES, createBaseCommand, getBaseCommand } from './base-command.js';
import { VERSION, getVersionInfo } from './version.js';
import {
  ProgressSpinner,
  StageProgressDisplay,
  formatDuration,
  createSpinner,
  createStageProgress,
} from './formatters/progress.js';
import {
  formatRunSummary,
  formatDegradedRunSummary,
  formatResumeRunSummary,
  formatErrorSummary,
  formatQuickSummary,
} from './formatters/run-summary.js';
import { getCommandHelp } from './commands/index.js';
import type { PipelineResult } from '../pipeline/executor.js';

// ============================================================================
// Program Tests
// ============================================================================

describe('CLI Program', () => {
  it('should create a program with correct name and version', () => {
    const program = createProgram();

    expect(program.name()).toBe('travel');
    expect(program.version()).toBe(VERSION);
  });

  it('should have global options configured', () => {
    const program = createProgram();
    const options = program.options;

    const optionNames = options.map((o) => o.long);

    expect(optionNames).toContain('--verbose');
    expect(optionNames).toContain('--quiet');
    expect(optionNames).toContain('--no-color');
    expect(optionNames).toContain('--data-dir');
  });

  it('should have subcommands registered', () => {
    const program = createProgram();
    const commands = program.commands;

    const commandNames = commands.map((c) => c.name());

    expect(commandNames).toContain('discover');
    expect(commandNames).toContain('session');
    expect(commandNames).toContain('run');
    expect(commandNames).toContain('config');
    expect(commandNames).toContain('export');
  });

  it('should have session subcommands', () => {
    const program = createProgram();
    const sessionCmd = program.commands.find((c) => c.name() === 'session');

    expect(sessionCmd).toBeDefined();
    const subcommands = sessionCmd!.commands.map((c) => c.name());
    expect(subcommands).toContain('list');
    expect(subcommands).toContain('view');
  });

  it('should have run subcommands', () => {
    const program = createProgram();
    const runCmd = program.commands.find((c) => c.name() === 'run');

    expect(runCmd).toBeDefined();
    const subcommands = runCmd!.commands.map((c) => c.name());
    expect(subcommands).toContain('list');
    expect(subcommands).toContain('resume');
  });
});

// ============================================================================
// Version Tests
// ============================================================================

describe('Version', () => {
  it('should export VERSION constant', () => {
    expect(VERSION).toBe('1.0.0');
  });

  it('should return formatted version info', () => {
    const info = getVersionInfo();
    expect(info).toBe('Travel Discovery Orchestrator v1.0.0');
  });
});

// ============================================================================
// BaseCommand Tests
// ============================================================================

describe('BaseCommand', () => {
  let consoleSpy: {
    log: jest.SpiedFunction<typeof console.log>;
    warn: jest.SpiedFunction<typeof console.warn>;
    error: jest.SpiedFunction<typeof console.error>;
  };

  beforeEach(() => {
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(() => {}),
      warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
      error: jest.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });

  it('should create with default options', () => {
    const cmd = new BaseCommand({});

    expect(cmd.isVerbose()).toBe(false);
    expect(cmd.isQuiet()).toBe(false);
  });

  it('should respect verbose option', () => {
    const cmd = new BaseCommand({ verbose: true });

    expect(cmd.isVerbose()).toBe(true);
    cmd.debug('test message');
    expect(consoleSpy.log).toHaveBeenCalled();
  });

  it('should hide debug messages when not verbose', () => {
    const cmd = new BaseCommand({});

    cmd.debug('test message');
    expect(consoleSpy.log).not.toHaveBeenCalled();
  });

  it('should respect quiet option', () => {
    const cmd = new BaseCommand({ quiet: true });

    expect(cmd.isQuiet()).toBe(true);
    cmd.info('test message');
    expect(consoleSpy.log).not.toHaveBeenCalled();
  });

  it('should log info messages when not quiet', () => {
    const cmd = new BaseCommand({});

    cmd.info('test message');
    expect(consoleSpy.log).toHaveBeenCalledWith('test message');
  });

  it('should always log warnings', () => {
    const cmdQuiet = new BaseCommand({ quiet: true });

    cmdQuiet.warn('warning message');
    expect(consoleSpy.warn).toHaveBeenCalled();
  });

  it('should log success messages', () => {
    const cmd = new BaseCommand({});

    cmd.success('success message');
    expect(consoleSpy.log).toHaveBeenCalled();
  });

  it('should log failure messages', () => {
    const cmd = new BaseCommand({});

    cmd.fail('failure message');
    expect(consoleSpy.log).toHaveBeenCalled();
  });

  it('should create with factory function', () => {
    const cmd = createBaseCommand({ verbose: true });

    expect(cmd).toBeInstanceOf(BaseCommand);
    expect(cmd.isVerbose()).toBe(true);
  });

  it('should get base command from commander opts', () => {
    const mockCmd = {
      opts: () => ({ _baseCommand: new BaseCommand({ verbose: true }) }),
    };

    const base = getBaseCommand(mockCmd);
    expect(base).toBeInstanceOf(BaseCommand);
    expect(base.isVerbose()).toBe(true);
  });

  it('should create default base command if not found', () => {
    const mockCmd = {
      opts: () => ({}),
    };

    const base = getBaseCommand(mockCmd);
    expect(base).toBeInstanceOf(BaseCommand);
  });
});

// ============================================================================
// Exit Codes Tests
// ============================================================================

describe('Exit Codes', () => {
  it('should define standard exit codes', () => {
    expect(EXIT_CODES.SUCCESS).toBe(0);
    expect(EXIT_CODES.ERROR).toBe(1);
    expect(EXIT_CODES.USAGE_ERROR).toBe(2);
    expect(EXIT_CODES.NOT_FOUND).toBe(3);
    expect(EXIT_CODES.API_ERROR).toBe(4);
    expect(EXIT_CODES.CANCELLED).toBe(130);
  });
});

// ============================================================================
// Progress Formatter Tests
// ============================================================================

describe('Progress Formatters', () => {
  describe('formatDuration', () => {
    it('should format milliseconds', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    it('should format seconds', () => {
      expect(formatDuration(1000)).toBe('1.0s');
      expect(formatDuration(5500)).toBe('5.5s');
      expect(formatDuration(59000)).toBe('59.0s');
    });

    it('should format minutes and seconds', () => {
      expect(formatDuration(60000)).toBe('1m 0s');
      expect(formatDuration(90000)).toBe('1m 30s');
      expect(formatDuration(150000)).toBe('2m 30s');
    });
  });

  describe('ProgressSpinner', () => {
    it('should create a spinner', () => {
      const spinner = new ProgressSpinner('Loading...');
      expect(spinner).toBeInstanceOf(ProgressSpinner);
    });

    it('should support method chaining', () => {
      const spinner = new ProgressSpinner('Loading...');
      const result = spinner.start('Starting...').update('Processing...').stop();
      expect(result).toBe(spinner);
    });

    it('should create with factory function', () => {
      const spinner = createSpinner('Loading...');
      expect(spinner).toBeInstanceOf(ProgressSpinner);
    });
  });

  describe('StageProgressDisplay', () => {
    it('should initialize all stages as pending', () => {
      const display = new StageProgressDisplay();
      const stages = display.getAllStages();

      expect(stages).toHaveLength(11);
      for (const stage of stages) {
        expect(stage.status).toBe('pending');
      }
    });

    it('should track stage start', () => {
      const display = new StageProgressDisplay();
      display.startStage(0);

      const stage = display.getStageDisplay(0);
      expect(stage?.status).toBe('running');
    });

    it('should track stage completion', () => {
      const display = new StageProgressDisplay();
      display.startStage(0);
      display.completeStage(0, 1234);

      const stage = display.getStageDisplay(0);
      expect(stage?.status).toBe('completed');
      expect(stage?.durationMs).toBe(1234);
    });

    it('should track stage failure', () => {
      const display = new StageProgressDisplay();
      display.startStage(0);
      display.failStage(0, 'Test error');

      const stage = display.getStageDisplay(0);
      expect(stage?.status).toBe('failed');
      expect(stage?.error).toBe('Test error');
    });

    it('should track stage skip', () => {
      const display = new StageProgressDisplay();
      display.skipStage(0);

      const stage = display.getStageDisplay(0);
      expect(stage?.status).toBe('skipped');
    });

    it('should return correct counts', () => {
      const display = new StageProgressDisplay();
      display.completeStage(0, 100);
      display.completeStage(1, 200);
      display.failStage(2, 'Error');
      display.skipStage(3);

      const counts = display.getCounts();
      expect(counts.completed).toBe(2);
      expect(counts.failed).toBe(1);
      expect(counts.skipped).toBe(1);
      expect(counts.pending).toBe(7);
    });

    it('should calculate total duration', () => {
      const display = new StageProgressDisplay();
      display.completeStage(0, 100);
      display.completeStage(1, 200);
      display.completeStage(2, 300);

      expect(display.getTotalDuration()).toBe(600);
    });

    it('should detect success', () => {
      const display = new StageProgressDisplay();
      display.completeStage(0, 100);
      display.completeStage(1, 200);

      expect(display.isSuccess()).toBe(true);
    });

    it('should detect failure', () => {
      const display = new StageProgressDisplay();
      display.completeStage(0, 100);
      display.failStage(1, 'Error');

      expect(display.isSuccess()).toBe(false);
    });

    it('should create with factory function', () => {
      const display = createStageProgress();
      expect(display).toBeInstanceOf(StageProgressDisplay);
    });
  });
});

// ============================================================================
// Run Summary Formatter Tests
// ============================================================================

describe('Run Summary Formatters', () => {
  const mockPipelineResult: PipelineResult = {
    success: true,
    stagesExecuted: [
      '00_enhancement',
      '01_intake',
      '02_router_plan',
      '03_worker_outputs',
    ],
    stagesSkipped: [],
    degradedStages: [],
    finalStage: '03_worker_outputs',
    timing: {
      startedAt: '2026-01-15T10:00:00Z',
      completedAt: '2026-01-15T10:02:00Z',
      durationMs: 120000,
      perStage: {
        '00_enhancement': 5000,
        '01_intake': 1000,
        '02_router_plan': 10000,
        '03_worker_outputs': 104000,
      },
    },
    errors: [],
  };

  describe('formatRunSummary', () => {
    it('should format successful run', () => {
      const summary = formatRunSummary({
        sessionId: 'test-session',
        runId: 'test-run',
        result: mockPipelineResult,
        candidatesFound: 50,
        topCandidates: 10,
      });

      expect(summary).toContain('Run Complete');
      expect(summary).toContain('test-session');
      expect(summary).toContain('test-run');
      expect(summary).toContain('SUCCESS');
      expect(summary).toContain('50');
      expect(summary).toContain('10');
    });

    it('should format failed run', () => {
      const failedResult = {
        ...mockPipelineResult,
        success: false,
        errors: [{ stageId: '03_worker_outputs', error: 'API error' }],
      };

      const summary = formatRunSummary({
        sessionId: 'test-session',
        runId: 'test-run',
        result: failedResult,
      });

      expect(summary).toContain('FAILED');
    });
  });

  describe('formatDegradedRunSummary', () => {
    it('should format degraded run', () => {
      const degradedResult = {
        ...mockPipelineResult,
        success: true,
        degradedStages: ['03_worker_outputs'],
      };

      const summary = formatDegradedRunSummary(
        {
          sessionId: 'test-session',
          runId: 'test-run',
          result: degradedResult,
        },
        [
          {
            stageId: '03_worker_outputs',
            error: 'Timeout',
            hasPartialResults: true,
          },
        ]
      );

      expect(summary).toContain('Degraded');
      expect(summary).toContain('PARTIAL SUCCESS');
      expect(summary).toContain('03_worker_outputs');
      expect(summary).toContain('Timeout');
      expect(summary).toContain('partial results');
    });
  });

  describe('formatResumeRunSummary', () => {
    it('should format resume run', () => {
      const resumeResult = {
        ...mockPipelineResult,
        stagesSkipped: ['00_enhancement', '01_intake'],
        stagesExecuted: ['02_router_plan', '03_worker_outputs'],
      };

      const summary = formatResumeRunSummary(
        {
          sessionId: 'test-session',
          runId: 'test-run-resume',
          result: resumeResult,
        },
        {
          sourceRunId: 'original-run',
          fromStage: 2,
          stagesSkipped: ['00_enhancement', '01_intake'],
        }
      );

      expect(summary).toContain('Resume Run');
      expect(summary).toContain('Stage 2');
      expect(summary).toContain('original-run');
      expect(summary).toContain('2 executed');
      expect(summary).toContain('2 skipped');
    });
  });

  describe('formatErrorSummary', () => {
    it('should format error list', () => {
      const summary = formatErrorSummary([
        { stageId: '03_worker_outputs', error: 'API timeout', continued: true },
        { stageId: '07_candidates_validated', error: 'Rate limit', continued: false },
      ]);

      expect(summary).toContain('Errors');
      expect(summary).toContain('03_worker_outputs');
      expect(summary).toContain('API timeout');
      expect(summary).toContain('continued');
      expect(summary).toContain('07_candidates_validated');
      expect(summary).toContain('stopped');
    });
  });

  describe('formatQuickSummary', () => {
    it('should format successful quick summary', () => {
      const summary = formatQuickSummary(mockPipelineResult);

      expect(summary).toContain('complete');
      expect(summary).toContain('2m');
      expect(summary).toContain('4 executed');
    });

    it('should format degraded quick summary', () => {
      const degradedResult = {
        ...mockPipelineResult,
        degradedStages: ['03_worker_outputs'],
      };

      const summary = formatQuickSummary(degradedResult);
      expect(summary).toContain('degraded');
    });

    it('should format failed quick summary', () => {
      const failedResult = {
        ...mockPipelineResult,
        success: false,
      };

      const summary = formatQuickSummary(failedResult);
      expect(summary).toContain('failed');
    });
  });
});

// ============================================================================
// Command Help Tests
// ============================================================================

describe('Command Help', () => {
  it('should return command help entries', () => {
    const help = getCommandHelp();

    expect(help.length).toBeGreaterThan(0);
    expect(help.find((h) => h.name.includes('discover'))).toBeDefined();
    expect(help.find((h) => h.name.includes('session'))).toBeDefined();
    expect(help.find((h) => h.name.includes('run'))).toBeDefined();
    expect(help.find((h) => h.name.includes('config'))).toBeDefined();
    expect(help.find((h) => h.name.includes('export'))).toBeDefined();
  });

  it('should have descriptions for all commands', () => {
    const help = getCommandHelp();

    for (const entry of help) {
      expect(entry.description).toBeTruthy();
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });
});
