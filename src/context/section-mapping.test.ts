/**
 * Tests for PRD/TODO Section Mapping Registry
 */

import {
  SECTION_MAPPING,
  getPrdSectionsForTodo,
  getTodoSectionsForPrd,
  getStageForTodo,
  getMappingForTodo,
  getTodoSectionsForStage,
  getMappingSummary,
} from './section-mapping.js';

describe('section-mapping', () => {
  describe('SECTION_MAPPING', () => {
    it('should have mappings for all major TODO sections', () => {
      // Phase 0.0
      expect(SECTION_MAPPING.some((m) => m.todoSection === '0.0')).toBe(true);

      // Phase 0 core (1-18)
      for (let i = 1; i <= 18; i++) {
        expect(
          SECTION_MAPPING.some((m) => m.todoSection === `${i}.0`)
        ).toBe(true);
      }
    });

    it('should have valid PRD section arrays for all mappings', () => {
      for (const mapping of SECTION_MAPPING) {
        expect(Array.isArray(mapping.prdSections)).toBe(true);
        expect(mapping.prdSections.length).toBeGreaterThan(0);
        for (const prd of mapping.prdSections) {
          expect(typeof prd).toBe('number');
          expect(prd).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('should have stages only for pipeline stages', () => {
      const stageMapping = SECTION_MAPPING.filter((m) => m.stage);
      for (const mapping of stageMapping) {
        expect(mapping.stage).toMatch(/^Stage \d{2}$/);
      }
    });
  });

  describe('getPrdSectionsForTodo', () => {
    it('should return PRD sections for TODO section 14', () => {
      const result = getPrdSectionsForTodo('14');
      expect(result).toEqual([14]);
    });

    it('should return PRD sections for TODO section 14.0', () => {
      const result = getPrdSectionsForTodo('14.0');
      expect(result).toEqual([14]);
    });

    it('should return PRD sections for TODO section 13 (Dedupe)', () => {
      const result = getPrdSectionsForTodo('13');
      expect(result).toEqual([14]);
    });

    it('should return multiple PRD sections for TODO section 12 (Normalization)', () => {
      const result = getPrdSectionsForTodo('12');
      expect(result).toEqual([11, 14]);
    });

    it('should return empty array for unknown section', () => {
      const result = getPrdSectionsForTodo('999');
      expect(result).toEqual([]);
    });

    it('should normalize subsection numbers to main section', () => {
      const result = getPrdSectionsForTodo('14.1');
      expect(result).toEqual([14]);
    });
  });

  describe('getTodoSectionsForPrd', () => {
    it('should return TODO sections 12.0, 13.0, 14.0 for PRD section 14', () => {
      const result = getTodoSectionsForPrd(14);
      expect(result).toContain('12.0');
      expect(result).toContain('13.0');
      expect(result).toContain('14.0');
    });

    it('should return multiple TODO sections for PRD section 11 (Pipeline)', () => {
      const result = getTodoSectionsForPrd(11);
      expect(result).toContain('4.0');
      expect(result).toContain('5.0');
      expect(result).toContain('8.0');
    });

    it('should return empty array for unused PRD section', () => {
      const result = getTodoSectionsForPrd(999);
      expect(result).toEqual([]);
    });
  });

  describe('getStageForTodo', () => {
    it('should return Stage 06 for TODO section 14.0 (Ranking)', () => {
      const result = getStageForTodo('14.0');
      expect(result).toBe('Stage 06');
    });

    it('should return Stage 05 for TODO section 13 (Dedupe)', () => {
      const result = getStageForTodo('13');
      expect(result).toBe('Stage 05');
    });

    it('should return undefined for non-stage TODO sections', () => {
      const result = getStageForTodo('1.0');
      expect(result).toBeUndefined();
    });

    it('should return Stage 00 for TODO section 6.0 (Enhancement)', () => {
      const result = getStageForTodo('6');
      expect(result).toBe('Stage 00');
    });
  });

  describe('getMappingForTodo', () => {
    it('should return full mapping for TODO section 14', () => {
      const result = getMappingForTodo('14');
      expect(result).toEqual({
        todoSection: '14.0',
        todoTitle: 'Ranking Stage with Diversity (Stage 06)',
        prdSections: [14],
        stage: 'Stage 06',
      });
    });

    it('should return undefined for unknown section', () => {
      const result = getMappingForTodo('999');
      expect(result).toBeUndefined();
    });
  });

  describe('getTodoSectionsForStage', () => {
    it('should return workers for Stage 03', () => {
      const result = getTodoSectionsForStage('Stage 03');
      expect(result).toHaveLength(3);
      expect(result.map((m) => m.todoSection)).toEqual(['9.0', '10.0', '11.0']);
    });

    it('should return empty array for unknown stage', () => {
      const result = getTodoSectionsForStage('Stage 99');
      expect(result).toEqual([]);
    });
  });

  describe('getMappingSummary', () => {
    it('should return formatted summary for TODO section 14', () => {
      const result = getMappingSummary('14');
      expect(result).toBe(
        'TODO 14.0 (Ranking Stage with Diversity (Stage 06)) -> PRD Sections: 14 | Stage: Stage 06'
      );
    });

    it('should return summary without stage for non-stage sections', () => {
      const result = getMappingSummary('1');
      expect(result).toBe(
        'TODO 1.0 (Project Foundation & Configuration) -> PRD Sections: 1, 10, 11'
      );
    });

    it('should return "No mapping found" for unknown sections', () => {
      const result = getMappingSummary('999');
      expect(result).toBe('TODO 999: No mapping found');
    });
  });
});
