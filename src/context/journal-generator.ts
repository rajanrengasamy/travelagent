/**
 * Journal Generation
 *
 * Generates session summaries and journal entries from conversation context.
 * Extracts work completed, open items, key decisions, and topics.
 *
 * @module context/journal-generator
 * @see PRD Section 0.8
 */

import type { GeneratedJournalEntry } from './types.js';

/**
 * Patterns for extracting work completed items from context.
 * Matches common patterns like:
 * - "Created file.ts"
 * - "Implemented function"
 * - "Fixed bug in..."
 * - "Added feature..."
 * - "Updated config..."
 */
const WORK_COMPLETED_PATTERNS = [
  /(?:created|implemented|added|built|wrote|developed|set up|configured|installed)\s+[^.!?\n]+/gi,
  /(?:fixed|resolved|corrected|patched)\s+[^.!?\n]+/gi,
  /(?:updated|modified|changed|refactored|improved|enhanced)\s+[^.!?\n]+/gi,
  /(?:completed|finished|done with)\s+[^.!?\n]+/gi,
  /- \[x\]\s+([^\n]+)/gi, // Checked checkboxes in markdown
];

/**
 * Patterns for extracting open/remaining items from context.
 */
const OPEN_ITEMS_PATTERNS = [
  /(?:need to|needs to|should|must|todo|to-do|remaining)\s+[^.!?\n]+/gi,
  /(?:still needs|not yet|incomplete|pending|blocked on)\s+[^.!?\n]+/gi,
  /(?:next step[s]?|follow[- ]?up|later)\s*[:.]?\s*[^.!?\n]+/gi,
  /- \[ \]\s+([^\n]+)/gi, // Unchecked checkboxes in markdown
];

/**
 * Patterns for extracting key decisions from context.
 */
const DECISION_PATTERNS = [
  /(?:decided to|decision:|chose to|opted for|going with|will use)\s+[^.!?\n]+/gi,
  /(?:because|since|reason:|rationale:)\s+[^.!?\n]+/gi,
  /(?:approach:|strategy:|plan:)\s+[^.!?\n]+/gi,
];

/**
 * Common topic keywords for categorization.
 */
const TOPIC_KEYWORDS: Record<string, string[]> = {
  'vector-db': ['lancedb', 'vectordb', 'vector', 'embedding', 'similarity'],
  rag: ['rag', 'retrieval', 'context', 'semantic search'],
  testing: ['test', 'jest', 'mock', 'spec', 'coverage'],
  api: ['api', 'endpoint', 'client', 'request', 'response'],
  cli: ['cli', 'command', 'terminal', 'shell'],
  storage: ['storage', 'file', 'persist', 'save', 'load'],
  pipeline: ['pipeline', 'stage', 'workflow', 'process'],
  typescript: ['typescript', 'type', 'interface', 'schema', 'zod'],
  journal: ['journal', 'session', 'summary', 'context'],
  worker: ['worker', 'perplexity', 'places', 'youtube'],
  config: ['config', 'environment', 'settings', 'options'],
};

/**
 * Extracts work completed items from conversation context.
 *
 * Scans the context for patterns indicating completed work and
 * returns a deduplicated list of work items.
 *
 * @param context - The conversation context text
 * @returns Array of work completed items
 */
export function extractWorkCompleted(context: string): string[] {
  const items = new Set<string>();

  for (const pattern of WORK_COMPLETED_PATTERNS) {
    const matches = context.matchAll(pattern);
    for (const match of matches) {
      // Use capture group if available (for checkbox pattern), otherwise full match
      const item = (match[1] || match[0]).trim();
      if (item.length > 10 && item.length < 200) {
        // Filter out too short or too long items
        items.add(cleanItem(item));
      }
    }
  }

  return Array.from(items).slice(0, 10); // Limit to 10 items
}

/**
 * Extracts open/remaining items from conversation context.
 *
 * Scans the context for patterns indicating pending work and
 * returns a deduplicated list of open items.
 *
 * @param context - The conversation context text
 * @returns Array of open items
 */
export function extractOpenItems(context: string): string[] {
  const items = new Set<string>();

  for (const pattern of OPEN_ITEMS_PATTERNS) {
    const matches = context.matchAll(pattern);
    for (const match of matches) {
      const item = (match[1] || match[0]).trim();
      if (item.length > 10 && item.length < 200) {
        items.add(cleanItem(item));
      }
    }
  }

  return Array.from(items).slice(0, 10);
}

/**
 * Extracts key decisions from conversation context.
 *
 * Scans the context for patterns indicating decisions made and
 * returns a deduplicated list.
 *
 * @param context - The conversation context text
 * @returns Array of key decisions
 */
export function extractKeyDecisions(context: string): string[] {
  const items = new Set<string>();

  for (const pattern of DECISION_PATTERNS) {
    const matches = context.matchAll(pattern);
    for (const match of matches) {
      const item = match[0].trim();
      if (item.length > 15 && item.length < 200) {
        items.add(cleanItem(item));
      }
    }
  }

  return Array.from(items).slice(0, 5); // Limit to 5 decisions
}

/**
 * Extracts topics from conversation context.
 *
 * Analyzes the context for topic keywords and returns a list
 * of identified topics for categorization.
 *
 * @param context - The conversation context text
 * @returns Array of topic identifiers
 */
export function extractTopics(context: string): string[] {
  const topics = new Set<string>();
  const lowerContext = context.toLowerCase();

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerContext.includes(keyword)) {
        topics.add(topic);
        break;
      }
    }
  }

  return Array.from(topics);
}

/**
 * Cleans and normalizes an extracted item.
 *
 * @param item - Raw extracted text
 * @returns Cleaned text
 */
function cleanItem(item: string): string {
  return item
    .replace(/^[-*]\s*/, '') // Remove leading bullets
    .replace(/^(Created|Implemented|Added|Fixed|Updated)\s+/i, '') // Normalize prefixes
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim();
}

/**
 * Generates a brief summary from the context.
 *
 * Creates a 2-3 sentence overview of what was accomplished.
 *
 * @param context - The conversation context
 * @param workCompleted - List of completed work items
 * @returns Generated summary text
 */
function generateSummary(
  _context: string,
  workCompleted: string[]
): string {
  if (workCompleted.length === 0) {
    return 'This session focused on exploration and planning without concrete deliverables.';
  }

  const mainItems = workCompleted.slice(0, 3);
  const itemCount = workCompleted.length;

  if (itemCount === 1) {
    return `This session focused on ${mainItems[0]}.`;
  }

  const lastItem = mainItems.pop();
  const summary = `This session completed ${itemCount} items including ${mainItems.join(', ')}${lastItem ? ` and ${lastItem}` : ''}.`;

  return summary;
}

/**
 * Generates the full journal entry content in markdown format.
 *
 * @param entry - The generated journal entry data
 * @returns Formatted markdown content
 */
export function formatJournalEntry(entry: GeneratedJournalEntry): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-AU', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  let markdown = `---\n\n## Session: ${dateStr} ${timeStr}\n\n`;

  // Summary
  markdown += `### Summary\n${entry.summary}\n\n`;

  // Work Completed
  if (entry.workCompleted.length > 0) {
    markdown += `### Work Completed\n`;
    for (const item of entry.workCompleted) {
      markdown += `- ${item}\n`;
    }
    markdown += '\n';
  }

  // Key Decisions
  if (entry.keyDecisions.length > 0) {
    markdown += `### Key Decisions\n`;
    for (const decision of entry.keyDecisions) {
      markdown += `- ${decision}\n`;
    }
    markdown += '\n';
  }

  // Open Items
  if (entry.openItems.length > 0) {
    markdown += `### Open Items / Blockers\n`;
    for (const item of entry.openItems) {
      markdown += `- [ ] ${item}\n`;
    }
    markdown += '\n';
  }

  // Topics (as tags)
  if (entry.topics.length > 0) {
    markdown += `### Topics\n`;
    markdown += entry.topics.map((t) => `\`${t}\``).join(' ') + '\n\n';
  }

  markdown += '---\n';

  return markdown;
}

/**
 * Generates a complete session summary from conversation context.
 *
 * Extracts all relevant information from the context and generates
 * a structured journal entry ready for storage.
 *
 * @param conversationContext - The full conversation context
 * @returns Promise resolving to the generated journal entry
 */
export async function generateSessionSummary(
  conversationContext: string
): Promise<GeneratedJournalEntry> {
  // Extract all components
  const workCompleted = extractWorkCompleted(conversationContext);
  const openItems = extractOpenItems(conversationContext);
  const keyDecisions = extractKeyDecisions(conversationContext);
  const topics = extractTopics(conversationContext);

  // Generate summary
  const summary = generateSummary(conversationContext, workCompleted);

  // Build the full entry
  const entry: GeneratedJournalEntry = {
    content: '', // Will be set after formatting
    summary,
    workCompleted,
    openItems,
    keyDecisions,
    topics,
  };

  // Generate formatted content
  entry.content = formatJournalEntry(entry);

  return entry;
}

/**
 * Creates a condensed summary suitable for session_summaries collection.
 *
 * @param entry - The full journal entry
 * @returns Condensed summary (200-300 tokens target)
 */
export function createCondensedSummary(entry: GeneratedJournalEntry): string {
  let condensed = entry.summary + '\n\n';

  if (entry.workCompleted.length > 0) {
    condensed += 'Completed: ' + entry.workCompleted.slice(0, 3).join('; ') + '.\n';
  }

  if (entry.openItems.length > 0) {
    condensed += 'Open: ' + entry.openItems.slice(0, 2).join('; ') + '.\n';
  }

  if (entry.keyDecisions.length > 0) {
    condensed += 'Decisions: ' + entry.keyDecisions.slice(0, 2).join('; ') + '.';
  }

  return condensed.trim();
}
