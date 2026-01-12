/**
 * Tests for Prompt Enhancer
 *
 * Uses Jest ESM mocking pattern for mocking LLM modules.
 * Tests cover all PRD requirements FR0.6-FR0.9.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { EnhancementAction, PartialSessionParams, PromptAnalysis } from '../schemas/enhancement.js';
import type { RefinementSuggestion } from './refinement.js';

// Mock the LLM modules before importing enhancer
jest.unstable_mockModule('./analyzer.js', () => ({
  analyzePrompt: jest.fn(),
}));

jest.unstable_mockModule('./questions.js', () => ({
  generateClarifyingQuestions: jest.fn(),
}));

jest.unstable_mockModule('./refinement.js', () => ({
  generateRefinement: jest.fn(),
  generateRefinementWithAnswers: jest.fn(),
  generateRefinementWithFeedback: jest.fn(),
}));

jest.unstable_mockModule('./extractor.js', () => ({
  extractSessionParams: jest.fn(),
}));

// Import after mocking
const { enhancePrompt, EnhancementTimeoutError } = await import('./enhancer.js');
const { analyzePrompt } = await import('./analyzer.js');
const { generateClarifyingQuestions } = await import('./questions.js');
const { generateRefinement, generateRefinementWithAnswers } = await import('./refinement.js');
const { extractSessionParams } = await import('./extractor.js');

// Type the mocks
const mockAnalyzePrompt = analyzePrompt as jest.MockedFunction<typeof analyzePrompt>;
const mockGenerateClarifyingQuestions = generateClarifyingQuestions as jest.MockedFunction<
  typeof generateClarifyingQuestions
>;
const mockGenerateRefinement = generateRefinement as jest.MockedFunction<typeof generateRefinement>;
const mockGenerateRefinementWithAnswers = generateRefinementWithAnswers as jest.MockedFunction<
  typeof generateRefinementWithAnswers
>;
const mockExtractSessionParams = extractSessionParams as jest.MockedFunction<typeof extractSessionParams>;

// Test fixtures
const createMockAnalysis = (overrides: Partial<PromptAnalysis> = {}): PromptAnalysis => ({
  isClear: true,
  confidence: 0.9,
  reasoning: 'Test analysis',
  extractedParams: {
    destinations: ['Tokyo'],
    interests: ['food', 'culture'],
  },
  ...overrides,
});

const createMockRefinement = (overrides: Partial<RefinementSuggestion> = {}): RefinementSuggestion => ({
  refinedPrompt: 'Enhanced travel prompt for Tokyo focusing on food and culture',
  explanation: 'Added specificity to the prompt',
  extractedParams: {
    destinations: ['Tokyo'],
    interests: ['food', 'culture'],
  },
  ...overrides,
});

const createMockExtractedParams = (overrides: Partial<PartialSessionParams> = {}): PartialSessionParams => ({
  destinations: ['Tokyo'],
  dateRange: { start: '2024-03-15', end: '2024-03-22' },
  flexibility: { type: 'plusMinusDays', days: 3 },
  interests: ['food', 'culture', 'temples'],
  constraints: {},
  inferredTags: ['spring', 'urban'],
  ...overrides,
});

describe('enhancePrompt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Skip Enhancement', () => {
    it('should skip enhancement when config.skip=true', async () => {
      const prompt = 'Trip to Tokyo';

      const resultPromise = enhancePrompt(prompt, { config: { skip: true } });
      jest.runAllTimers();
      const result = await resultPromise;

      expect(result.wasEnhanced).toBe(false);
      expect(result.originalPrompt).toBe(prompt);
      expect(result.refinedPrompt).toBe(prompt);
      expect(result.iterationCount).toBe(0);
      expect(mockAnalyzePrompt).not.toHaveBeenCalled();
    });

    it('should return skip action from callback', async () => {
      const prompt = 'Trip to Tokyo';

      mockAnalyzePrompt.mockResolvedValueOnce(createMockAnalysis());
      mockGenerateRefinement.mockResolvedValueOnce(createMockRefinement());

      const onRefinementSuggestion = jest
        .fn<(s: RefinementSuggestion) => Promise<EnhancementAction>>()
        .mockResolvedValueOnce('skip');

      const resultPromise = enhancePrompt(prompt, { onRefinementSuggestion });
      jest.runAllTimers();
      const result = await resultPromise;

      expect(result.wasEnhanced).toBe(false);
      expect(result.refinedPrompt).toBe(prompt);
    });
  });

  describe('Clear Prompt Flow', () => {
    it('should return refinement suggestion for clear prompt', async () => {
      const prompt = 'Week-long trip to Tokyo in March for food and culture';

      mockAnalyzePrompt.mockResolvedValueOnce(createMockAnalysis({ isClear: true }));
      mockGenerateRefinement.mockResolvedValueOnce(createMockRefinement());
      mockExtractSessionParams.mockResolvedValueOnce(createMockExtractedParams());

      const onRefinementSuggestion = jest
        .fn<(s: RefinementSuggestion) => Promise<EnhancementAction>>()
        .mockResolvedValueOnce('accept');

      const resultPromise = enhancePrompt(prompt, { onRefinementSuggestion });
      jest.runAllTimers();
      const result = await resultPromise;

      expect(mockAnalyzePrompt).toHaveBeenCalledWith(prompt);
      expect(mockGenerateRefinement).toHaveBeenCalled();
      expect(onRefinementSuggestion).toHaveBeenCalled();
      expect(result.wasEnhanced).toBe(true);
    });
  });

  describe('Ambiguous Prompt Flow', () => {
    it('should generate clarifying questions for ambiguous prompt', async () => {
      const prompt = 'I want to travel somewhere nice';
      const questions = ['Where would you like to go?', 'When are you planning to travel?'];
      const answers = ['Tokyo', 'March 2024'];

      mockAnalyzePrompt.mockResolvedValueOnce(
        createMockAnalysis({
          isClear: false,
          confidence: 0.3,
          clarifyingQuestions: questions,
        })
      );
      mockGenerateRefinementWithAnswers.mockResolvedValueOnce(createMockRefinement());
      mockExtractSessionParams.mockResolvedValueOnce(createMockExtractedParams());

      const onClarifyingQuestions = jest
        .fn<(q: string[]) => Promise<string[]>>()
        .mockResolvedValueOnce(answers);
      const onRefinementSuggestion = jest
        .fn<(s: RefinementSuggestion) => Promise<EnhancementAction>>()
        .mockResolvedValueOnce('accept');

      const resultPromise = enhancePrompt(prompt, {
        onClarifyingQuestions,
        onRefinementSuggestion,
      });
      jest.runAllTimers();
      const result = await resultPromise;

      expect(onClarifyingQuestions).toHaveBeenCalledWith(questions);
      expect(mockGenerateRefinementWithAnswers).toHaveBeenCalled();
      expect(result.wasEnhanced).toBe(true);
    });

    it('should generate questions when analysis has none', async () => {
      const prompt = 'I want to travel';
      const generatedQuestions = ['What destination interests you?', 'What dates work?'];

      mockAnalyzePrompt.mockResolvedValueOnce(
        createMockAnalysis({
          isClear: false,
          confidence: 0.2,
          clarifyingQuestions: undefined,
        })
      );
      mockGenerateClarifyingQuestions.mockReturnValueOnce(generatedQuestions);
      mockGenerateRefinementWithAnswers.mockResolvedValueOnce(createMockRefinement());
      mockExtractSessionParams.mockResolvedValueOnce(createMockExtractedParams());

      const onClarifyingQuestions = jest.fn<(q: string[]) => Promise<string[]>>().mockResolvedValueOnce([]);
      const onRefinementSuggestion = jest
        .fn<(s: RefinementSuggestion) => Promise<EnhancementAction>>()
        .mockResolvedValueOnce('accept');

      const resultPromise = enhancePrompt(prompt, {
        onClarifyingQuestions,
        onRefinementSuggestion,
      });
      jest.runAllTimers();
      const result = await resultPromise;

      expect(mockGenerateClarifyingQuestions).toHaveBeenCalled();
      expect(onClarifyingQuestions).toHaveBeenCalledWith(generatedQuestions);
      expect(result.wasEnhanced).toBe(true);
    });
  });

  describe('User Actions (FR0.6)', () => {
    it('should accept refinement and return enhanced result', async () => {
      const prompt = 'Trip to Tokyo';
      const refinedPrompt = 'Enhanced Tokyo trip';

      mockAnalyzePrompt.mockResolvedValueOnce(createMockAnalysis());
      mockGenerateRefinement.mockResolvedValueOnce(createMockRefinement({ refinedPrompt }));
      mockExtractSessionParams.mockResolvedValueOnce(createMockExtractedParams());

      const onRefinementSuggestion = jest
        .fn<(s: RefinementSuggestion) => Promise<EnhancementAction>>()
        .mockResolvedValueOnce('accept');

      const resultPromise = enhancePrompt(prompt, { onRefinementSuggestion });
      jest.runAllTimers();
      const result = await resultPromise;

      expect(result.wasEnhanced).toBe(true);
      expect(result.originalPrompt).toBe(prompt);
      expect(result.refinedPrompt).toBe(refinedPrompt);
    });

    it('should reject refinement and return original prompt', async () => {
      const prompt = 'Trip to Tokyo';

      mockAnalyzePrompt.mockResolvedValueOnce(createMockAnalysis());
      mockGenerateRefinement.mockResolvedValueOnce(createMockRefinement());
      mockExtractSessionParams.mockResolvedValueOnce(createMockExtractedParams());

      const onRefinementSuggestion = jest
        .fn<(s: RefinementSuggestion) => Promise<EnhancementAction>>()
        .mockResolvedValueOnce('reject');

      const resultPromise = enhancePrompt(prompt, { onRefinementSuggestion });
      jest.runAllTimers();
      const result = await resultPromise;

      expect(result.wasEnhanced).toBe(false);
      expect(result.originalPrompt).toBe(prompt);
      expect(result.refinedPrompt).toBe(prompt);
    });

    it('should handle feedback action and iterate', async () => {
      const prompt = 'Trip to Tokyo';

      // First iteration
      mockAnalyzePrompt.mockResolvedValueOnce(createMockAnalysis());
      mockGenerateRefinement.mockResolvedValueOnce(createMockRefinement({ refinedPrompt: 'First refinement' }));

      // Second iteration (after feedback)
      mockAnalyzePrompt.mockResolvedValueOnce(createMockAnalysis());
      mockGenerateRefinement.mockResolvedValueOnce(
        createMockRefinement({ refinedPrompt: 'Second refinement after feedback' })
      );
      mockExtractSessionParams.mockResolvedValueOnce(createMockExtractedParams());

      const onRefinementSuggestion = jest
        .fn<(s: RefinementSuggestion) => Promise<EnhancementAction>>()
        .mockResolvedValueOnce('feedback')
        .mockResolvedValueOnce('accept');

      const resultPromise = enhancePrompt(prompt, {
        onRefinementSuggestion,
        feedback: 'I prefer budget options',
      });
      jest.runAllTimers();
      const result = await resultPromise;

      expect(result.iterationCount).toBe(2);
      expect(result.wasEnhanced).toBe(true);
      expect(result.refinedPrompt).toBe('Second refinement after feedback');
    });
  });

  describe('Max Iterations (FR0.7)', () => {
    it('should use last suggestion when max iterations reached', async () => {
      const prompt = 'Trip to Tokyo';
      const lastRefinement = 'Final refinement after max iterations';

      // Mock 3 iterations of feedback
      for (let i = 0; i < 3; i++) {
        mockAnalyzePrompt.mockResolvedValueOnce(createMockAnalysis());
        mockGenerateRefinement.mockResolvedValueOnce(
          createMockRefinement({
            refinedPrompt: i === 2 ? lastRefinement : `Refinement ${i + 1}`,
          })
        );
      }

      const onRefinementSuggestion = jest
        .fn<(s: RefinementSuggestion) => Promise<EnhancementAction>>()
        .mockResolvedValue('feedback'); // Always return feedback

      const resultPromise = enhancePrompt(prompt, {
        onRefinementSuggestion,
        config: { maxIterations: 3 },
      });
      jest.runAllTimers();
      const result = await resultPromise;

      expect(result.iterationCount).toBe(3);
      expect(result.refinedPrompt).toBe(lastRefinement);
      expect(result.wasEnhanced).toBe(true);
    });

    it('should respect custom maxIterations config', async () => {
      const prompt = 'Trip to Tokyo';

      // Mock 5 iterations
      for (let i = 0; i < 5; i++) {
        mockAnalyzePrompt.mockResolvedValueOnce(createMockAnalysis());
        mockGenerateRefinement.mockResolvedValueOnce(createMockRefinement());
      }

      const onRefinementSuggestion = jest
        .fn<(s: RefinementSuggestion) => Promise<EnhancementAction>>()
        .mockResolvedValue('feedback');

      const resultPromise = enhancePrompt(prompt, {
        onRefinementSuggestion,
        config: { maxIterations: 5 },
      });
      jest.runAllTimers();
      const result = await resultPromise;

      expect(result.iterationCount).toBe(5);
    });
  });

  describe('Graceful Degradation (FR0.8)', () => {
    it('should return original prompt on LLM timeout', async () => {
      const prompt = 'Trip to Tokyo';

      mockAnalyzePrompt.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new EnhancementTimeoutError('Timeout', 15000)), 100);
          })
      );

      const resultPromise = enhancePrompt(prompt, {
        config: { timeoutMs: 15000 },
      });
      jest.advanceTimersByTime(200);
      const result = await resultPromise;

      expect(result.wasEnhanced).toBe(false);
      expect(result.refinedPrompt).toBe(prompt);
    });

    it('should return original prompt on LLM error', async () => {
      const prompt = 'Trip to Tokyo';

      mockAnalyzePrompt.mockRejectedValueOnce(new Error('LLM API error'));

      const resultPromise = enhancePrompt(prompt);
      jest.runAllTimers();
      const result = await resultPromise;

      expect(result.wasEnhanced).toBe(false);
      expect(result.refinedPrompt).toBe(prompt);
      expect(result.originalPrompt).toBe(prompt);
    });

    it('should use last refinement on later error', async () => {
      const prompt = 'Trip to Tokyo';
      const firstRefinement = 'First good refinement';

      // First iteration succeeds
      mockAnalyzePrompt.mockResolvedValueOnce(createMockAnalysis());
      mockGenerateRefinement.mockResolvedValueOnce(createMockRefinement({ refinedPrompt: firstRefinement }));

      // Second iteration fails
      mockAnalyzePrompt.mockRejectedValueOnce(new Error('API error'));

      const onRefinementSuggestion = jest
        .fn<(s: RefinementSuggestion) => Promise<EnhancementAction>>()
        .mockResolvedValueOnce('feedback');

      const resultPromise = enhancePrompt(prompt, { onRefinementSuggestion });
      jest.runAllTimers();
      const result = await resultPromise;

      expect(result.wasEnhanced).toBe(true);
      expect(result.refinedPrompt).toBe(firstRefinement);
    });

    it('should handle callback errors gracefully', async () => {
      const prompt = 'Trip to Tokyo';

      mockAnalyzePrompt.mockResolvedValueOnce(createMockAnalysis());
      mockGenerateRefinement.mockResolvedValueOnce(createMockRefinement());
      mockExtractSessionParams.mockResolvedValueOnce(createMockExtractedParams());

      const onRefinementSuggestion = jest
        .fn<(s: RefinementSuggestion) => Promise<EnhancementAction>>()
        .mockRejectedValueOnce(new Error('Callback error'));

      const resultPromise = enhancePrompt(prompt, { onRefinementSuggestion });
      jest.runAllTimers();
      const result = await resultPromise;

      // Should default to accept
      expect(result.wasEnhanced).toBe(true);
    });

    it('should handle extraction failure gracefully', async () => {
      const prompt = 'Trip to Tokyo';
      const refinementParams = { destinations: ['Tokyo'] };

      mockAnalyzePrompt.mockResolvedValueOnce(createMockAnalysis());
      mockGenerateRefinement.mockResolvedValueOnce(createMockRefinement({ extractedParams: refinementParams }));
      mockExtractSessionParams.mockRejectedValueOnce(new Error('Extraction failed'));

      const onRefinementSuggestion = jest
        .fn<(s: RefinementSuggestion) => Promise<EnhancementAction>>()
        .mockResolvedValueOnce('accept');

      const resultPromise = enhancePrompt(prompt, { onRefinementSuggestion });
      jest.runAllTimers();
      const result = await resultPromise;

      // Should use params from refinement
      expect(result.wasEnhanced).toBe(true);
      expect(result.extractedParams).toEqual(refinementParams);
    });
  });

  describe('Auto-Enhance Mode', () => {
    it('should automatically accept first suggestion in auto-enhance mode', async () => {
      const prompt = 'Trip to Tokyo';

      mockAnalyzePrompt.mockResolvedValueOnce(createMockAnalysis());
      mockGenerateRefinement.mockResolvedValueOnce(createMockRefinement());
      mockExtractSessionParams.mockResolvedValueOnce(createMockExtractedParams());

      const resultPromise = enhancePrompt(prompt, {
        config: { autoEnhance: true },
      });
      jest.runAllTimers();
      const result = await resultPromise;

      expect(result.wasEnhanced).toBe(true);
      expect(result.iterationCount).toBe(1);
    });
  });

  describe('Result Schema Validation', () => {
    it('should return valid EnhancementResult schema', async () => {
      const prompt = 'Trip to Tokyo';

      mockAnalyzePrompt.mockResolvedValueOnce(createMockAnalysis());
      mockGenerateRefinement.mockResolvedValueOnce(createMockRefinement());
      mockExtractSessionParams.mockResolvedValueOnce(createMockExtractedParams());

      const onRefinementSuggestion = jest
        .fn<(s: RefinementSuggestion) => Promise<EnhancementAction>>()
        .mockResolvedValueOnce('accept');

      const resultPromise = enhancePrompt(prompt, { onRefinementSuggestion });
      jest.runAllTimers();
      const result = await resultPromise;

      // Verify all required fields
      expect(result.schemaVersion).toBe(1);
      expect(typeof result.originalPrompt).toBe('string');
      expect(typeof result.refinedPrompt).toBe('string');
      expect(typeof result.wasEnhanced).toBe('boolean');
      expect(typeof result.extractedParams).toBe('object');
      expect(typeof result.iterationCount).toBe('number');
      expect(typeof result.modelUsed).toBe('string');
      expect(typeof result.processingTimeMs).toBe('number');
      expect(typeof result.createdAt).toBe('string');

      // Verify timestamp format
      expect(new Date(result.createdAt).toISOString()).toBe(result.createdAt);
    });

    it('should track processing time correctly', async () => {
      const prompt = 'Trip to Tokyo';

      mockAnalyzePrompt.mockResolvedValueOnce(createMockAnalysis());
      mockGenerateRefinement.mockResolvedValueOnce(createMockRefinement());
      mockExtractSessionParams.mockResolvedValueOnce(createMockExtractedParams());

      const onRefinementSuggestion = jest
        .fn<(s: RefinementSuggestion) => Promise<EnhancementAction>>()
        .mockResolvedValueOnce('accept');

      const resultPromise = enhancePrompt(prompt, { onRefinementSuggestion });
      jest.advanceTimersByTime(500);
      const result = await resultPromise;

      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Default Callbacks', () => {
    it('should use default callbacks when none provided', async () => {
      const prompt = 'Trip to Tokyo';

      mockAnalyzePrompt.mockResolvedValueOnce(createMockAnalysis());
      mockGenerateRefinement.mockResolvedValueOnce(createMockRefinement());
      mockExtractSessionParams.mockResolvedValueOnce(createMockExtractedParams());

      const resultPromise = enhancePrompt(prompt);
      jest.runAllTimers();
      const result = await resultPromise;

      // Default should accept
      expect(result.wasEnhanced).toBe(true);
    });

    it('should handle clarifying questions with default callback', async () => {
      const prompt = 'I want to travel';

      mockAnalyzePrompt.mockResolvedValueOnce(
        createMockAnalysis({
          isClear: false,
          clarifyingQuestions: ['Where?', 'When?'],
        })
      );
      mockGenerateRefinementWithAnswers.mockResolvedValueOnce(createMockRefinement());
      mockExtractSessionParams.mockResolvedValueOnce(createMockExtractedParams());

      const resultPromise = enhancePrompt(prompt);
      jest.runAllTimers();
      const result = await resultPromise;

      // Should proceed with empty answers
      expect(mockGenerateRefinementWithAnswers).toHaveBeenCalled();
      expect(result.wasEnhanced).toBe(true);
    });
  });
});
