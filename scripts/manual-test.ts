/**
 * Manual Test Script for Travel Discovery
 *
 * Calls the real Perplexity API to validate that the discovery
 * pipeline produces useful travel recommendations.
 *
 * Usage: npm run test:manual
 *
 * Edit the destination and interests below to test different searches.
 */

import 'dotenv/config';
import { PerplexityClient, PerplexityWorker } from '../src/workers/perplexity/index.js';
import type { Session, CostTracker, CircuitBreaker, EnrichedIntent } from '../src/workers/types.js';

// ============================================================================
// Test Configuration - EDIT THESE TO TEST DIFFERENT SEARCHES
// ============================================================================

const DESTINATION = 'Tokyo';
const INTERESTS = ['food', 'temples', 'local experiences'];
const TRAVEL_DATES = { start: '2026-03-01', end: '2026-03-10' };

// ============================================================================
// Stub implementations (we don't need real cost/circuit tracking for this test)
// ============================================================================

const costTracker: CostTracker = {
  addPerplexity: () => {},
  addGemini: () => {},
  addOpenAI: () => {},
  addPlacesCall: () => {},
  addYouTubeUnits: () => {},
  getCost: () => ({
    total: 0,
    breakdown: {
      perplexity: { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 },
      gemini: { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 },
      openai: { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 },
      places: { calls: 0, cost: 0 },
      youtube: { units: 0, cost: 0 },
    },
  }),
  reset: () => {},
};

const circuitBreaker: CircuitBreaker = {
  recordSuccess: () => {},
  recordFailure: () => {},
  isOpen: () => false,
  getStatus: () => ({}),
};

// ============================================================================
// Main test function
// ============================================================================

async function main() {
  console.log('\n========================================');
  console.log('  Travel Discovery - Manual Test');
  console.log('========================================\n');

  // Build session object
  const session: Session = {
    schemaVersion: 1,
    sessionId: `test-${Date.now()}`,
    title: `${DESTINATION} Discovery Test`,
    destinations: [DESTINATION],
    dateRange: TRAVEL_DATES,
    flexibility: { type: 'none' },
    interests: INTERESTS,
    constraints: {},
    createdAt: new Date().toISOString(),
  };

  // Build enriched intent (normally produced by the router)
  const enrichedIntent: EnrichedIntent = {
    destinations: [DESTINATION],
    dateRange: TRAVEL_DATES,
    flexibility: { type: 'none' },
    interests: [...INTERESTS, 'hidden gems'],
    constraints: {},
    inferredTags: ['asia', 'spring', 'culture'],
  };

  // Build worker context
  const context = {
    session,
    runId: `run-${Date.now()}`,
    enrichedIntent,
    costTracker,
    circuitBreaker,
  };

  console.log(`Destination: ${DESTINATION}`);
  console.log(`Interests: ${INTERESTS.join(', ')}`);
  console.log(`Dates: ${TRAVEL_DATES.start} to ${TRAVEL_DATES.end}\n`);

  // Initialize worker
  const client = new PerplexityClient();
  const worker = new PerplexityWorker(client);

  // Step 1: Generate queries
  console.log('--- Step 1: Query Generation ---\n');
  const assignment = await worker.plan(session, enrichedIntent);

  // Increase timeout for better reliability (default is too aggressive)
  assignment.timeout = 120000; // 2 minutes total

  console.log('Generated queries:');
  assignment.queries.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));
  console.log('');

  // Step 2: Execute API calls
  console.log('--- Step 2: API Execution ---\n');
  console.log('Calling Perplexity API (this may take 10-30 seconds)...\n');

  const startTime = Date.now();
  const output = await worker.execute(assignment, context);
  const elapsed = Date.now() - startTime;

  console.log(`Status: ${output.status}`);
  console.log(`Duration: ${elapsed}ms`);
  if (output.tokenUsage) {
    console.log(`Tokens: ${output.tokenUsage.input} in / ${output.tokenUsage.output} out`);
  }
  if (output.error) {
    console.log(`Error: ${output.error}`);
  }
  console.log('');

  // Step 3: Display results
  console.log('--- Step 3: Results ---\n');

  if (output.candidates.length === 0) {
    console.log('No candidates found.');
    console.log('Check that PERPLEXITY_API_KEY is set in .env');
    return;
  }

  console.log(`Found ${output.candidates.length} candidates:\n`);
  console.log('─'.repeat(60));

  output.candidates.forEach((candidate, i) => {
    console.log(`\n${i + 1}. [${candidate.type.toUpperCase()}] ${candidate.title}`);

    // Truncate summary if too long
    const summary = candidate.summary.length > 250
      ? candidate.summary.slice(0, 250) + '...'
      : candidate.summary;
    console.log(`   ${summary}`);

    if (candidate.locationText) {
      console.log(`   Location: ${candidate.locationText}`);
    }
    if (candidate.tags && candidate.tags.length > 0) {
      console.log(`   Tags: ${candidate.tags.join(', ')}`);
    }
    if (candidate.sourceRefs && candidate.sourceRefs.length > 0) {
      console.log(`   Sources: ${candidate.sourceRefs.length} reference(s)`);
    }
    console.log(`   Confidence: ${candidate.confidence}`);
  });

  console.log('\n' + '─'.repeat(60));
  console.log('\nTest complete! The discovery pipeline is working.');
  console.log('Edit DESTINATION and INTERESTS at the top of this file to test other searches.\n');
}

// Run with error handling
main().catch((error) => {
  console.error('\nError running test:', error.message);
  if (error.message.includes('API key')) {
    console.error('Make sure PERPLEXITY_API_KEY is set in your .env file');
  }
  process.exit(1);
});
