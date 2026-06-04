/** Linear 0..1 scale from count relative to min/max across tags. */
export function tagCountScale(
  count: number,
  minCount: number,
  maxCount: number
): number {
  const c = Math.max(0, count);
  const min = Math.max(0, minCount);
  const max = Math.max(0, maxCount);
  if (max <= min) return 0;
  return (c - min) / (max - min);
}

export function tagCountBounds(counts: number[]): { min: number; max: number } {
  if (counts.length === 0) return { min: 0, max: 0 };
  let min = counts[0]!;
  let max = counts[0]!;
  for (const n of counts) {
    if (n < min) min = n;
    if (n > max) max = n;
  }
  return { min, max };
}

export interface TagCloudChipMetrics {
  fontSizeRem: number;
  labelPaddingX: number;
  chipPaddingY: number;
}

const FONT_MIN = 0.8;
const FONT_MAX = 1.35;
const PX_MIN = 1;
const PX_MAX = 2.5;
const PY_MIN = 2;
const PY_MAX = 8;

/** Map song count to chip typography/padding for the tag cloud. */
export function getTagCloudChipMetrics(
  count: number,
  minCount: number,
  maxCount: number
): TagCloudChipMetrics {
  const t = tagCountScale(count, minCount, maxCount);
  return {
    fontSizeRem: FONT_MIN + t * (FONT_MAX - FONT_MIN),
    labelPaddingX: PX_MIN + t * (PX_MAX - PX_MIN),
    chipPaddingY: PY_MIN + t * (PY_MAX - PY_MIN),
  };
}

export function normalizeTagCount(count: unknown): number {
  const n = Number(count);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}
