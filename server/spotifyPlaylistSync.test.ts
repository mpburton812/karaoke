import { describe, expect, it, vi } from "vitest";

vi.mock("./db.js", () => ({
  db: { execute: vi.fn(), batch: vi.fn() },
  tursoConfigured: true,
}));

import { parseSpotifyPlaylistId } from "./spotifyPlaylistSync.js";

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
