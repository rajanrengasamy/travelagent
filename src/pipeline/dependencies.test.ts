/**
 * Tests for Stage Dependency Map
 *
 * @module pipeline/dependencies.test
 */

import { describe, it, expect } from '@jest/globals';
import {
  STAGE_DEPENDENCIES,
  STAGE_IDS,
  STAGE_FILE_NAMES,
  TOTAL_STAGES,
  VALID_STAGE_NUMBERS,
  isValidStageNumber,
  getStageId,
  getStageName,
  getImmediateUpstream,
  getUpstreamStages,
  getDownstreamStages,
  getStagesToSkip,
  getStagesToExecute,
  dependsOn,
} from './dependencies.js';

describe('pipeline/dependencies', () => {
  // ==========================================================================
  // Constants Tests
  // ==========================================================================

  describe('STAGE_DEPENDENCIES', () => {
    it('should have 11 stages (0-10)', () => {
      expect(Object.keys(STAGE_DEPENDENCIES)).toHaveLength(11);
    });

    it('stage 0 should have no upstream', () => {
      expect(STAGE_DEPENDENCIES[0]).toBeNull();
    });

    it('each subsequent stage should depend on previous', () => {
      for (let i = 1; i <= 10; i++) {
        expect(STAGE_DEPENDENCIES[i]).toBe(i - 1);
      }
    });

    it('should form a linear chain from 0 to 10', () => {
      // Verify the chain is complete by walking from stage 10 back to 0
      let current: number | null = 10;
      const visited: number[] = [];

      while (current !== null) {
        visited.unshift(current);
        current = STAGE_DEPENDENCIES[current];
      }

      expect(visited).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
  });

  describe('STAGE_IDS', () => {
    it('should have 11 stage IDs', () => {
      expect(Object.keys(STAGE_IDS)).toHaveLength(11);
    });

    it('should have correct format for each stage ID', () => {
      // Pattern: NN_stage_name
      const pattern = /^\d{2}_[a-z_]+$/;
      for (let i = 0; i <= 10; i++) {
        expect(STAGE_IDS[i]).toMatch(pattern);
      }
    });

    it('should have correct stage IDs', () => {
      expect(STAGE_IDS[0]).toBe('00_enhancement');
      expect(STAGE_IDS[1]).toBe('01_intake');
      expect(STAGE_IDS[2]).toBe('02_router_plan');
      expect(STAGE_IDS[3]).toBe('03_worker_outputs');
      expect(STAGE_IDS[4]).toBe('04_candidates_normalized');
      expect(STAGE_IDS[5]).toBe('05_candidates_deduped');
      expect(STAGE_IDS[6]).toBe('06_candidates_ranked');
      expect(STAGE_IDS[7]).toBe('07_candidates_validated');
      expect(STAGE_IDS[8]).toBe('08_top_candidates');
      expect(STAGE_IDS[9]).toBe('09_aggregator_output');
      expect(STAGE_IDS[10]).toBe('10_results');
    });

    it('should have stage number prefix matching index', () => {
      for (let i = 0; i <= 10; i++) {
        const prefix = STAGE_IDS[i].substring(0, 2);
        expect(parseInt(prefix, 10)).toBe(i);
      }
    });
  });

  describe('STAGE_FILE_NAMES', () => {
    it('should have 11 stage names', () => {
      expect(Object.keys(STAGE_FILE_NAMES)).toHaveLength(11);
    });

    it('should have correct stage names', () => {
      expect(STAGE_FILE_NAMES[0]).toBe('enhancement');
      expect(STAGE_FILE_NAMES[1]).toBe('intake');
      expect(STAGE_FILE_NAMES[2]).toBe('router_plan');
      expect(STAGE_FILE_NAMES[3]).toBe('worker_outputs');
      expect(STAGE_FILE_NAMES[4]).toBe('candidates_normalized');
      expect(STAGE_FILE_NAMES[5]).toBe('candidates_deduped');
      expect(STAGE_FILE_NAMES[6]).toBe('candidates_ranked');
      expect(STAGE_FILE_NAMES[7]).toBe('candidates_validated');
      expect(STAGE_FILE_NAMES[8]).toBe('top_candidates');
      expect(STAGE_FILE_NAMES[9]).toBe('aggregator_output');
      expect(STAGE_FILE_NAMES[10]).toBe('results');
    });

    it('stage names should match stage IDs without prefix', () => {
      for (let i = 0; i <= 10; i++) {
        const expectedName = STAGE_IDS[i].substring(3); // Remove "NN_"
        expect(STAGE_FILE_NAMES[i]).toBe(expectedName);
      }
    });
  });

  describe('TOTAL_STAGES', () => {
    it('should be 11', () => {
      expect(TOTAL_STAGES).toBe(11);
    });
  });

  describe('VALID_STAGE_NUMBERS', () => {
    it('should contain all stages 0-10', () => {
      expect(VALID_STAGE_NUMBERS).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('should have length matching TOTAL_STAGES', () => {
      expect(VALID_STAGE_NUMBERS.length).toBe(TOTAL_STAGES);
    });
  });

  // ==========================================================================
  // Validation Functions Tests
  // ==========================================================================

  describe('isValidStageNumber', () => {
    it('should return true for 0-10', () => {
      for (let i = 0; i <= 10; i++) {
        expect(isValidStageNumber(i)).toBe(true);
      }
    });

    it('should return false for negative numbers', () => {
      expect(isValidStageNumber(-1)).toBe(false);
      expect(isValidStageNumber(-10)).toBe(false);
    });

    it('should return false for numbers > 10', () => {
      expect(isValidStageNumber(11)).toBe(false);
      expect(isValidStageNumber(100)).toBe(false);
    });

    it('should return false for non-integers', () => {
      expect(isValidStageNumber(2.5)).toBe(false);
      expect(isValidStageNumber(0.1)).toBe(false);
      expect(isValidStageNumber(9.999)).toBe(false);
    });

    it('should return false for NaN', () => {
      expect(isValidStageNumber(NaN)).toBe(false);
    });

    it('should return false for Infinity', () => {
      expect(isValidStageNumber(Infinity)).toBe(false);
      expect(isValidStageNumber(-Infinity)).toBe(false);
    });
  });

  // ==========================================================================
  // Stage ID and Name Functions Tests
  // ==========================================================================

  describe('getStageId', () => {
    it('should return correct ID for each stage', () => {
      expect(getStageId(0)).toBe('00_enhancement');
      expect(getStageId(5)).toBe('05_candidates_deduped');
      expect(getStageId(8)).toBe('08_top_candidates');
      expect(getStageId(10)).toBe('10_results');
    });

    it('should throw for invalid stage number', () => {
      expect(() => getStageId(-1)).toThrow('Invalid stage number: -1');
      expect(() => getStageId(11)).toThrow('Invalid stage number: 11');
      expect(() => getStageId(2.5)).toThrow('Invalid stage number: 2.5');
    });
  });

  describe('getStageName', () => {
    it('should return correct name for each stage', () => {
      expect(getStageName(0)).toBe('enhancement');
      expect(getStageName(5)).toBe('candidates_deduped');
      expect(getStageName(8)).toBe('top_candidates');
      expect(getStageName(10)).toBe('results');
    });

    it('should throw for invalid stage number', () => {
      expect(() => getStageName(-1)).toThrow('Invalid stage number: -1');
      expect(() => getStageName(11)).toThrow('Invalid stage number: 11');
    });
  });

  // ==========================================================================
  // Dependency Functions Tests
  // ==========================================================================

  describe('getImmediateUpstream', () => {
    it('should return null for stage 0', () => {
      expect(getImmediateUpstream(0)).toBeNull();
    });

    it('should return previous stage for stages 1-10', () => {
      for (let i = 1; i <= 10; i++) {
        expect(getImmediateUpstream(i)).toBe(i - 1);
      }
    });

    it('should throw for invalid stage number', () => {
      expect(() => getImmediateUpstream(-1)).toThrow('Invalid stage number');
      expect(() => getImmediateUpstream(11)).toThrow('Invalid stage number');
    });
  });

  describe('getUpstreamStages', () => {
    it('should return empty array for stage 0', () => {
      expect(getUpstreamStages(0)).toEqual([]);
    });

    it('should return [0] for stage 1', () => {
      expect(getUpstreamStages(1)).toEqual([0]);
    });

    it('should return [0, 1] for stage 2', () => {
      expect(getUpstreamStages(2)).toEqual([0, 1]);
    });

    it('should return [0, 1, 2, 3, 4] for stage 5', () => {
      expect(getUpstreamStages(5)).toEqual([0, 1, 2, 3, 4]);
    });

    it('should return all stages 0-9 for stage 10', () => {
      expect(getUpstreamStages(10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('should return stages in ascending order (earliest first)', () => {
      const upstream = getUpstreamStages(8);
      for (let i = 1; i < upstream.length; i++) {
        expect(upstream[i]).toBeGreaterThan(upstream[i - 1]);
      }
    });

    it('should throw for invalid stage number', () => {
      expect(() => getUpstreamStages(-1)).toThrow('Invalid stage number');
      expect(() => getUpstreamStages(11)).toThrow('Invalid stage number');
    });
  });

  describe('getDownstreamStages', () => {
    it('should return [1,2,3,4,5,6,7,8,9,10] for stage 0', () => {
      expect(getDownstreamStages(0)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('should return [6,7,8,9,10] for stage 5', () => {
      expect(getDownstreamStages(5)).toEqual([6, 7, 8, 9, 10]);
    });

    it('should return [9, 10] for stage 8', () => {
      expect(getDownstreamStages(8)).toEqual([9, 10]);
    });

    it('should return [10] for stage 9', () => {
      expect(getDownstreamStages(9)).toEqual([10]);
    });

    it('should return empty array for stage 10', () => {
      expect(getDownstreamStages(10)).toEqual([]);
    });

    it('should return stages in ascending order (immediate first)', () => {
      const downstream = getDownstreamStages(3);
      for (let i = 1; i < downstream.length; i++) {
        expect(downstream[i]).toBeGreaterThan(downstream[i - 1]);
      }
    });

    it('should throw for invalid stage number', () => {
      expect(() => getDownstreamStages(-1)).toThrow('Invalid stage number');
      expect(() => getDownstreamStages(11)).toThrow('Invalid stage number');
    });
  });

  describe('getStagesToSkip', () => {
    it('should return empty array when resuming from stage 0', () => {
      expect(getStagesToSkip(0)).toEqual([]);
    });

    it('should return [0, 1, 2, 3, 4, 5, 6, 7] when resuming from stage 8', () => {
      expect(getStagesToSkip(8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });

    it('should return same as getUpstreamStages', () => {
      for (let i = 0; i <= 10; i++) {
        expect(getStagesToSkip(i)).toEqual(getUpstreamStages(i));
      }
    });

    it('should throw for invalid stage number', () => {
      expect(() => getStagesToSkip(-1)).toThrow('Invalid stage number');
    });
  });

  describe('getStagesToExecute', () => {
    it('should return all stages when starting from stage 0', () => {
      expect(getStagesToExecute(0)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('should return [8, 9, 10] when resuming from stage 8', () => {
      expect(getStagesToExecute(8)).toEqual([8, 9, 10]);
    });

    it('should return [10] when resuming from stage 10', () => {
      expect(getStagesToExecute(10)).toEqual([10]);
    });

    it('should include the fromStage itself', () => {
      for (let i = 0; i <= 10; i++) {
        expect(getStagesToExecute(i)).toContain(i);
        expect(getStagesToExecute(i)[0]).toBe(i);
      }
    });

    it('skipped + executed should equal all stages', () => {
      for (let i = 0; i <= 10; i++) {
        const skipped = getStagesToSkip(i);
        const executed = getStagesToExecute(i);
        const all = [...skipped, ...executed].sort((a, b) => a - b);
        expect(all).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      }
    });

    it('should throw for invalid stage number', () => {
      expect(() => getStagesToExecute(-1)).toThrow('Invalid stage number');
    });
  });

  describe('dependsOn', () => {
    it('should return true for direct dependencies', () => {
      expect(dependsOn(1, 0)).toBe(true);
      expect(dependsOn(5, 4)).toBe(true);
      expect(dependsOn(10, 9)).toBe(true);
    });

    it('should return true for transitive dependencies', () => {
      expect(dependsOn(5, 2)).toBe(true);
      expect(dependsOn(10, 0)).toBe(true);
      expect(dependsOn(8, 3)).toBe(true);
    });

    it('should return false for reverse dependencies', () => {
      expect(dependsOn(2, 5)).toBe(false);
      expect(dependsOn(0, 10)).toBe(false);
      expect(dependsOn(3, 8)).toBe(false);
    });

    it('should return false for self-dependency', () => {
      for (let i = 0; i <= 10; i++) {
        expect(dependsOn(i, i)).toBe(false);
      }
    });

    it('should return false for stage 0 depending on anything', () => {
      for (let i = 1; i <= 10; i++) {
        expect(dependsOn(0, i)).toBe(false);
      }
    });

    it('should throw for invalid stage numbers', () => {
      expect(() => dependsOn(-1, 5)).toThrow('Invalid stage number');
      expect(() => dependsOn(5, -1)).toThrow('Invalid stage number');
      expect(() => dependsOn(11, 5)).toThrow('Invalid stage number');
      expect(() => dependsOn(5, 11)).toThrow('Invalid stage number');
    });
  });

  // ==========================================================================
  // Consistency Tests
  // ==========================================================================

  describe('consistency checks', () => {
    it('all constants should have same number of entries', () => {
      const depCount = Object.keys(STAGE_DEPENDENCIES).length;
      const idCount = Object.keys(STAGE_IDS).length;
      const nameCount = Object.keys(STAGE_FILE_NAMES).length;

      expect(depCount).toBe(TOTAL_STAGES);
      expect(idCount).toBe(TOTAL_STAGES);
      expect(nameCount).toBe(TOTAL_STAGES);
    });

    it('every stage should be in all constants', () => {
      for (let i = 0; i <= 10; i++) {
        expect(i in STAGE_DEPENDENCIES).toBe(true);
        expect(i in STAGE_IDS).toBe(true);
        expect(i in STAGE_FILE_NAMES).toBe(true);
      }
    });

    it('upstream and downstream should be complementary', () => {
      for (let i = 0; i <= 10; i++) {
        for (let j = 0; j <= 10; j++) {
          if (i !== j) {
            const iDependsOnJ = dependsOn(i, j);
            const jDependsOnI = dependsOn(j, i);
            // If i depends on j, j should not depend on i (and vice versa)
            expect(iDependsOnJ && jDependsOnI).toBe(false);
          }
        }
      }
    });
  });
});
