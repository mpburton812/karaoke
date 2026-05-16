import { describe, expect, it, vi } from "vitest";

vi.mock("./db.js", () => ({
  db: { execute: vi.fn(), batch: vi.fn() },
  tursoConfigured: true,
}));

import {
  parseSpotifyPlaylistId,
  readSimplifiedPlaylistTrackTotal,
  playlistAllowsTrackImport,
} from "./spotifyPlaylistSync.js";

describe("readSimplifiedPlaylistTrackTotal", () => {
  it("reads total from items ref (Spotify simplified playlist shape)", () => {
    expect(
      readSimplifiedPlaylistTrackTotal({
        items: { href: "https://api.spotify.com/v1/...", total: 42 },
      })
    ).toBe(42);
  });

  it("falls back to deprecated tracks ref", () => {
    expect(
      readSimplifiedPlaylistTrackTotal({
        tracks: { href: "https://api.spotify.com/v1/...", total: 7 },
      })
    ).toBe(7);
  });

  it("prefers items ref when both are present", () => {
    expect(
      readSimplifiedPlaylistTrackTotal({
        items: { total: 10 },
        tracks: { total: 99 },
      })
    ).toBe(10);
  });

  it("returns 0 when no totals", () => {
    expect(readSimplifiedPlaylistTrackTotal({})).toBe(0);
  });
});

describe("parseSpotifyPlaylistId", () => {
  it("parses open.spotify.com URL", () => {
    expect(
      parseSpotifyPlaylistId(
        "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc"
      )
    ).toBe("37i9dQZF1DXcBWIGoYBM5M");
  });

  it("parses spotify: URI", () => {
    expect(parseSpotifyPlaylistId("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M")).toBe(
      "37i9dQZF1DXcBWIGoYBM5M"
    );
  });

  it("accepts raw id", () => {
    expect(parseSpotifyPlaylistId("37i9dQZF1DXcBWIGoYBM5M")).toBe(
      "37i9dQZF1DXcBWIGoYBM5M"
    );
  });

  it("returns null for garbage", () => {
    expect(parseSpotifyPlaylistId("")).toBeNull();
    expect(parseSpotifyPlaylistId("not-a-playlist")).toBeNull();
  });
});

describe("playlistAllowsTrackImport", () => {
  it("allows own playlists", () => {
    expect(playlistAllowsTrackImport("abc", "abc", false)).toBe(true);
  });

  it("allows collaborative playlists (may include false positives for follow-only collab lists)", () => {
    expect(playlistAllowsTrackImport("me", "other", true)).toBe(true);
  });

  it("disallows follow-only (other owner, not collaborative)", () => {
    expect(playlistAllowsTrackImport("me", "other", false)).toBe(false);
  });

  it("disallows when your id is empty", () => {
    expect(playlistAllowsTrackImport("", "x", false)).toBe(false);
  });
});
