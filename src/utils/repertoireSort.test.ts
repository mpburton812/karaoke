import { describe, expect, it } from "vitest";
import {
  buildLetterCounts,
  filterRepertoireSongs,
  getLetterBucket,
  letterKeysWithCounts,
  sortSongsByTrackName,
} from "./repertoireSort.js";

describe("repertoireSort", () => {
  const songs = [
    { track_name: "Zebra", artist_name: "A", vocal_status: "Practicing" },
    { track_name: "apple", artist_name: "B", vocal_status: "Mastered" },
    { track_name: "Banana", artist_name: "C", vocal_status: "Practicing" },
    { track_name: "99 Problems", artist_name: "D", vocal_status: "Practicing" },
  ];

  it("sorts by track name case-insensitively", () => {
    const sorted = sortSongsByTrackName(songs);
    expect(sorted.map((s) => s.track_name)).toEqual([
      "99 Problems",
      "apple",
      "Banana",
      "Zebra",
    ]);
  });

  it("buckets non-letters as #", () => {
    expect(getLetterBucket("99 Problems")).toBe("#");
    expect(getLetterBucket("Hello")).toBe("H");
  });

  it("builds letter counts respecting status filter", () => {
    const counts = buildLetterCounts(songs, ["Practicing"]);
    expect(counts.B).toBe(1);
    expect(counts.Z).toBe(1);
    expect(counts["#"]).toBe(1);
    expect(counts.A).toBeUndefined();
  });

  it("lists letter keys in A–Z order with # last", () => {
    const keys = letterKeysWithCounts({ A: 1, M: 2, "#": 1 });
    expect(keys).toEqual(["A", "M", "#"]);
  });

  it("filters by search, status, and letter", () => {
    const sorted = sortSongsByTrackName(songs);
    const result = filterRepertoireSongs(sorted, {
      letterFilter: "B",
      statusFilter: [],
    });
    expect(result.map((s) => s.track_name)).toEqual(["Banana"]);
  });
});
