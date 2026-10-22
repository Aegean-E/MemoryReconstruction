import { describe, expect, it } from 'vitest';
import { buildVictorySummary } from '../src/ui/victorySummary';

describe('victory summary', () => {
  it('formats run completion data', () => {
    expect(
      buildVictorySummary({
        deepestDepth: 17.9,
        completedRuns: 3,
        level: 12,
        memoryFragments: 48,
      })
    ).toEqual({ depth: 17, runs: 3, level: 12, fragments: 48 });
  });

  it('clamps missing or invalid values to safe minimums', () => {
    expect(
      buildVictorySummary({
        deepestDepth: Number.NaN,
        completedRuns: -2,
        level: 0,
        memoryFragments: 'many',
      })
    ).toEqual({ depth: 0, runs: 1, level: 1, fragments: 0 });
  });
});
