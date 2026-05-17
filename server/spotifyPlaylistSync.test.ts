import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db.js", () => ({
  db: { execute: vi.fn(), batch: vi.fn() },
  tursoConfigured: true,
}));

import {
  deleteImportedSongsForSpotifyPlaylist,
  parseSpotifyPlaylistId,
  readSimplifiedPlaylistTrackTotal,
  playlistAllowsTrackImport,
  syncSpotifyPlaylist,
} from "./spotifyPlaylistSync.js";
import { db } from "./db.js";

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

describe("deleteImportedSongsForSpotifyPlaylist", () => {
  beforeEach(() => {
    vi.mocked(db.execute).mockReset();
  });

  it("unlinks playlist songs and deletes orphaned Spotify-created songs", async () => {
    vi.mocked(db.execute)
      .mockResolvedValueOnce({ rows: [{ song_id: 1 }, { song_id: 2 }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ c: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    const result = await deleteImportedSongsForSpotifyPlaylist(42, "spotify-pl");

    expect(result).toEqual({ deleted: 1, unlinked: 2 });
    expect(db.execute).toHaveBeenCalledTimes(6);
    expect(vi.mocked(db.execute).mock.calls[1]![0]).toMatchObject({
      sql: expect.stringContaining("DELETE FROM spotify_playlist_songs"),
      args: [42, "spotify-pl"],
    });
    expect(vi.mocked(db.execute).mock.calls[3]![0]).toMatchObject({
      sql: expect.stringContaining("DELETE FROM songs"),
      args: [42, 1, 2],
    });
    expect(vi.mocked(db.execute).mock.calls[5]![0]).toMatchObject({
      sql: expect.stringContaining("DELETE FROM spotify_synced_playlists"),
      args: [42, "spotify-pl"],
    });
  });

  it("removes the playlist sync entry even when no imported songs remain", async () => {
    vi.mocked(db.execute)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    const result = await deleteImportedSongsForSpotifyPlaylist(42, "empty-pl");

    expect(result).toEqual({ deleted: 0, unlinked: 0 });
    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(vi.mocked(db.execute).mock.calls[1]![0]).toMatchObject({
      sql: expect.stringContaining("DELETE FROM spotify_synced_playlists"),
      args: [42, "empty-pl"],
    });
  });
});

describe("syncSpotifyPlaylist duplicate linking", () => {
  beforeEach(() => {
    vi.mocked(db.execute).mockReset();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.stubEnv("SPOTIFY_CLIENT_ID", "cid");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "secret");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("links an existing library song to the playlist instead of inserting a duplicate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ access_token: "access", expires_in: 3600 }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: "playlist123456789",
              name: "Playlist One",
              snapshot_id: "snap1",
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              items: [
                {
                  track: {
                    id: "track1",
                    name: "Already Here",
                    artists: [{ name: "The Artist" }],
                    album: {},
                    duration_ms: 123000,
                  },
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
        )
    );

    vi.mocked(db.execute)
      .mockResolvedValueOnce({
        rows: [{ spotify_refresh_token: "refresh" }],
      } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({
        rows: [
          { id: 99, track_name: "Already Here", artist_name: "The Artist" },
        ],
      } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    const result = await syncSpotifyPlaylist(42, "playlist123456789");

    expect(result.added).toBe(0);
    expect(result.linkedExisting).toBe(1);
    expect(result.duplicateSongs).toEqual([
      { trackName: "Already Here", artistName: "The Artist" },
    ]);
    expect(db.execute).toHaveBeenCalledTimes(6);
    expect(vi.mocked(db.execute).mock.calls[5]![0]).toMatchObject({
      sql: expect.stringContaining("INSERT OR IGNORE INTO spotify_playlist_songs"),
      args: [42, "playlist123456789", 99, "track1", "Already Here", "The Artist"],
    });
  });
});
