/**
 * PRD/TODO Section Mapping Registry
 *
 * Provides a mapping between TODO task sections and PRD sections.
 * This is necessary because:
 * - PRD Section 14 = "Ranking, Dedupe, and Clustering" (one section covering multiple topics)
 * - TODO 13.0 = Dedupe & Clustering (Stage 05) -> maps to PRD Section 14
 * - TODO 14.0 = Ranking Stage (Stage 06) -> maps to PRD Section 14 (same section!)
 *
 * @module context/section-mapping
 */

/**
 * Represents a mapping from a TODO section to its corresponding PRD sections
 */
export interface SectionMapping {
  /** TODO section number (e.g., "13.0") */
  todoSection: string;
  /** TODO section title for display */
  todoTitle: string;
  /** PRD section numbers this TODO maps to */
  prdSections: number[];
  /** Pipeline stage identifier if applicable */
  stage?: string;
}

/**
 * Complete mapping of TODO sections to PRD sections.
 *
 * PRD Section Reference:
 * - 0: Development Infrastructure
 * - 1: Introduction & Overview
 * - 8: Prompt Enhancement & Router
 * - 10: Architecture Overview
 * - 11: Pipeline Model & Stage Execution
 * - 12: Data Model & Schemas
 * - 13: Storage Layer
 * - 14: Ranking, Dedupe, and Clustering
 * - 15: YouTube Social Signals
 * - 16: CLI Design
 * - 17: Error Handling & Resilience
 * - 18: Telegram Interface (Phase 1)
 * - 19: Acceptance Criteria
 */
export const SECTION_MAPPING: SectionMapping[] = [
  // Phase 0.0 - Context Persistence Infrastructure
  {
    todoSection: '0.0',
    todoTitle: 'Context Persistence Infrastructure',
    prdSections: [0],
  },

  // Phase 0 - Core Pipeline
  {
    todoSection: '1.0',
    todoTitle: 'Project Foundation & Configuration',
    prdSections: [1, 10, 11],
  },
  {
    todoSection: '2.0',
    todoTitle: 'Schema Definitions & Versioning',
    prdSections: [12],
  },
  {
    todoSection: '3.0',
    todoTitle: 'Storage Layer Implementation',
    prdSections: [13],
  },
  {
    todoSection: '4.0',
    todoTitle: 'Pipeline Stage Infrastructure',
    prdSections: [11],
  },
  {
    todoSection: '5.0',
    todoTitle: 'Session Management Core',
    prdSections: [11, 12],
  },
  {
    todoSection: '6.0',
    todoTitle: 'Prompt Enhancement (Stage 00)',
    prdSections: [8],
    stage: 'Stage 00',
  },
  {
    todoSection: '7.0',
    todoTitle: 'Router Implementation (Stage 02)',
    prdSections: [8, 10],
    stage: 'Stage 02',
  },
  {
    todoSection: '8.0',
    todoTitle: 'Worker Framework & Interface',
    prdSections: [10, 11],
  },
  {
    todoSection: '9.0',
    todoTitle: 'Perplexity Web Knowledge Worker',
    prdSections: [8, 10],
    stage: 'Stage 03',
  },
  {
    todoSection: '10.0',
    todoTitle: 'Google Places Worker',
    prdSections: [8, 10],
    stage: 'Stage 03',
  },
  {
    todoSection: '11.0',
    todoTitle: 'YouTube Social Signals Worker',
    prdSections: [8, 10, 15],
    stage: 'Stage 03',
  },
  {
    todoSection: '12.0',
    todoTitle: 'Normalization Stage (Stage 04)',
    prdSections: [11, 14],
    stage: 'Stage 04',
  },
  {
    todoSection: '13.0',
    todoTitle: 'Deduplication & Clustering (Stage 05)',
    prdSections: [14],
    stage: 'Stage 05',
  },
  {
    todoSection: '14.0',
    todoTitle: 'Ranking Stage with Diversity (Stage 06)',
    prdSections: [14],
    stage: 'Stage 06',
  },
  {
    todoSection: '15.0',
    todoTitle: 'Social Validation Stage (Stage 07)',
    prdSections: [15],
    stage: 'Stage 07',
  },
  {
    todoSection: '16.0',
    todoTitle: 'Top Candidates Selection (Stage 08)',
    prdSections: [11],
    stage: 'Stage 08',
  },
  {
    todoSection: '17.0',
    todoTitle: 'Aggregator Stage (Stage 09)',
    prdSections: [10, 11],
    stage: 'Stage 09',
  },
  {
    todoSection: '18.0',
    todoTitle: 'Results Generation (Stage 10)',
    prdSections: [11, 12],
    stage: 'Stage 10',
  },
  {
    todoSection: '19.0',
    todoTitle: 'Cost Tracking System',
    prdSections: [9],
  },
  {
    todoSection: '20.0',
    todoTitle: 'Triage System',
    prdSections: [12],
  },
  {
    todoSection: '21.0',
    todoTitle: 'Export Functionality',
    prdSections: [11],
  },
  {
    todoSection: '22.0',
    todoTitle: 'CLI Framework Setup',
    prdSections: [16],
  },
  {
    todoSection: '23.0',
    todoTitle: 'CLI Session Commands',
    prdSections: [16],
  },
  {
    todoSection: '24.0',
    todoTitle: 'CLI Run Commands',
    prdSections: [16],
  },
  {
    todoSection: '25.0',
    todoTitle: 'CLI Auxiliary Commands',
    prdSections: [16],
  },
  {
    todoSection: '26.0',
    todoTitle: 'Error Recovery & Resilience',
    prdSections: [17],
  },
  {
    todoSection: '27.0',
    todoTitle: 'Evaluation Harness',
    prdSections: [19],
  },
  {
    todoSection: '28.0',
    todoTitle: 'Integration Testing & Documentation',
    prdSections: [19],
  },

  // Phase 1 - Telegram Interface
  {
    todoSection: '29.0',
    todoTitle: 'Vercel Webhook Setup',
    prdSections: [18],
  },
  {
    todoSection: '30.0',
    todoTitle: 'Mac Worker Infrastructure',
    prdSections: [18],
  },
  {
    todoSection: '31.0',
    todoTitle: 'Media Processing',
    prdSections: [18],
  },
  {
    todoSection: '32.0',
    todoTitle: 'HTML Output Generation',
    prdSections: [18],
  },
  {
    todoSection: '33.0',
    todoTitle: 'Vercel Blob Publishing',
    prdSections: [18],
  },
  {
    todoSection: '34.0',
    todoTitle: 'Telegram Bot Commands',
    prdSections: [18],
  },
  {
    todoSection: '35.0',
    todoTitle: 'Operational Setup',
    prdSections: [18],
  },
];

/**
 * Normalize a section identifier to the "X.0" format.
 * Handles inputs like "14", "14.0", "14.1" -> "14.0"
 */
function normalizeSection(section: string): string {
  const parts = section.split('.');
  return `${parts[0]}.0`;
}

/**
 * Get PRD section numbers that correspond to a TODO section.
 *
 * @param todoSection - TODO section (e.g., "14" or "14.0")
 * @returns Array of PRD section numbers
 *
 * @example
 * getPrdSectionsForTodo("14") // returns [14]
 * getPrdSectionsForTodo("13.0") // returns [14]
 */
export function getPrdSectionsForTodo(todoSection: string): number[] {
  const normalized = normalizeSection(todoSection);
  const mapping = SECTION_MAPPING.find((m) => m.todoSection === normalized);
  return mapping?.prdSections ?? [];
}

/**
 * Get TODO sections that correspond to a PRD section.
 *
 * @param prdSection - PRD section number
 * @returns Array of TODO section identifiers
 *
 * @example
 * getTodoSectionsForPrd(14) // returns ["12.0", "13.0", "14.0"]
 */
export function getTodoSectionsForPrd(prdSection: number): string[] {
  return SECTION_MAPPING.filter((m) => m.prdSections.includes(prdSection)).map(
    (m) => m.todoSection
  );
}

/**
 * Get the pipeline stage for a TODO section.
 *
 * @param todoSection - TODO section (e.g., "14" or "14.0")
 * @returns Stage identifier (e.g., "Stage 06") or undefined if not a stage
 *
 * @example
 * getStageForTodo("14.0") // returns "Stage 06"
 * getStageForTodo("1.0") // returns undefined
 */
export function getStageForTodo(todoSection: string): string | undefined {
  const normalized = normalizeSection(todoSection);
  const mapping = SECTION_MAPPING.find((m) => m.todoSection === normalized);
  return mapping?.stage;
}

/**
 * Get full mapping details for a TODO section.
 *
 * @param todoSection - TODO section (e.g., "14" or "14.0")
 * @returns The complete SectionMapping or undefined if not found
 *
 * @example
 * getMappingForTodo("14")
 * // returns {
 * //   todoSection: "14.0",
 * //   todoTitle: "Ranking Stage with Diversity (Stage 06)",
 * //   prdSections: [14],
 * //   stage: "Stage 06"
 * // }
 */
export function getMappingForTodo(
  todoSection: string
): SectionMapping | undefined {
  const normalized = normalizeSection(todoSection);
  return SECTION_MAPPING.find((m) => m.todoSection === normalized);
}

/**
 * Get all TODO sections that map to a specific pipeline stage.
 *
 * @param stageId - Stage identifier (e.g., "Stage 06")
 * @returns Array of SectionMapping objects for that stage
 *
 * @example
 * getTodoSectionsForStage("Stage 03")
 * // returns mappings for 9.0 (Perplexity), 10.0 (Places), 11.0 (YouTube)
 */
export function getTodoSectionsForStage(stageId: string): SectionMapping[] {
  return SECTION_MAPPING.filter((m) => m.stage === stageId);
}

/**
 * Get a human-readable summary of a TODO section's mapping.
 *
 * @param todoSection - TODO section (e.g., "14")
 * @returns Formatted string describing the mapping
 *
 * @example
 * getMappingSummary("14")
 * // returns "TODO 14.0 (Ranking Stage with Diversity (Stage 06)) -> PRD Sections: 14 | Stage: Stage 06"
 */
export function getMappingSummary(todoSection: string): string {
  const mapping = getMappingForTodo(todoSection);
  if (!mapping) {
    return `TODO ${todoSection}: No mapping found`;
  }

  const prdStr = mapping.prdSections.join(', ');
  const stageStr = mapping.stage ? ` | Stage: ${mapping.stage}` : '';
  return `TODO ${mapping.todoSection} (${mapping.todoTitle}) -> PRD Sections: ${prdStr}${stageStr}`;
}
