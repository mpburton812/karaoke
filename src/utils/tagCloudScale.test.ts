import { describe, expect, it } from "vitest";
import {
  getTagCloudChipMetrics,
  normalizeTagCount,
  tagCountBounds,
  tagCountScale,
} from "./tagCloudScale";

describe("tagCountScale", () => {
  it("returns 0 when all counts are equal", () => {
    expect(tagCountScale(5, 5, 5)).toBe(0);
    expect(tagCountScale(0, 0, 0)).toBe(0);
  });

  it("returns 0 at min and 1 at max", () => {
    expect(tagCountScale(2, 2, 10)).toBe(0);
    expect(tagCountScale(10, 2, 10)).toBe(1);
    expect(tagCountScale(6, 2, 10)).toBe(0.5);
  });
});

describe("tagCountBounds", () => {
  it("returns 0,0 for empty input", () => {
    expect(tagCountBounds([])).toEqual({ min: 0, max: 0 });
  });
});

describe("getTagCloudChipMetrics", () => {
  it("uses minimum size when all counts are zero", () => {
    const m = getTagCloudChipMetrics(0, 0, 0);
    expect(m.fontSizeRem).toBe(0.8);
    expect(m.labelPaddingX).toBe(1);
    expect(m.chipPaddingY).toBe(2);
  });

  it("uses maximum size for the dominant tag", () => {
    const m = getTagCloudChipMetrics(20, 0, 20);
    expect(m.fontSizeRem).toBe(1.35);
    expect(m.labelPaddingX).toBe(2.5);
    expect(m.chipPaddingY).toBe(8);
  });
});

describe("normalizeTagCount", () => {
  it("coerces strings and rejects invalid values", () => {
    expect(normalizeTagCount("12")).toBe(12);
    expect(normalizeTagCount(undefined)).toBe(0);
    expect(normalizeTagCount(-1)).toBe(0);
  });
});
