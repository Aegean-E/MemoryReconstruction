/**
 * Pure victory-summary formatting. Kept outside MenuSystem so run-completion
 * data can be unit-tested without a DOM.
 */

export interface VictorySummary {
  depth: number;
  runs: number;
  level: number;
  fragments: number;
}

const finiteInt = (value: unknown, fallback: number, min: number): number => {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.floor(number));
};

export function buildVictorySummary(data: any): VictorySummary {
  return {
    depth: finiteInt(data?.deepestDepth, 0, 0),
    runs: finiteInt(data?.completedRuns, 1, 1),
    level: finiteInt(data?.level, 1, 1),
    fragments: finiteInt(data?.memoryFragments, 0, 0),
  };
}
