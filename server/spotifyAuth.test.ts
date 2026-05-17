import { describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";

vi.mock("./db.js", () => ({
  db: { execute: vi.fn(), batch: vi.fn() },
  tursoConfigured: true,
}));

import {
  signSpotifyOAuthState,
  verifySpotifyOAuthState,
  exchangeSpotifyCode,
  buildSpotifyAuthorizeUrl,
  fetchSpotifyCurrentUser,
  isSpotifyRefreshTokenDeadError,
  normalizeWebOrigin,
  refreshSpotifyAccessToken,
  getSpotifyAccessTokenForUser,
} from "./spotifyAuth.js";
import { db } from "./db.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("isSpotifyRefreshTokenDeadError", () => {
  it("detects revoked / invalid_grant style messages", () => {
    expect(isSpotifyRefreshTokenDeadError("Refresh token revoked")).toBe(true);
    expect(isSpotifyRefreshTokenDeadError("invalid_grant")).toBe(true);
    expect(
      isSpotifyRefreshTokenDeadError("The token has been expired or revoked")
    ).toBe(true);
    expect(isSpotifyRefreshTokenDeadError("network timeout")).toBe(false);
  });

  it("does not treat unrelated 'revoked' copy as refresh failure", () => {
    expect(isSpotifyRefreshTokenDeadError("Access was revoked")).toBe(false);
  });
});

describe("spotifyAuth state JWT", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  it("round-trips user id and PKCE verifier in OAuth state", () => {
    const { state, codeChallenge } = signSpotifyOAuthState(99);
    expect(codeChallenge.length).toBeGreaterThan(10);
    const { userId, codeVerifier, returnBase } = verifySpotifyOAuthState(state);
    expect(userId).toBe(99);
    expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(returnBase).toBeUndefined();
  });

  it("embeds return base when browser Origin matches Spotify callback origin", () => {
    vi.stubEnv(
      "SPOTIFY_REDIRECT_URI",
      "https://karaoke-companion-api.onrender.com/api/spotify/callback"
    );
    vi.stubEnv("PUBLIC_APP_URL", "https://wrong.example.com");
    const { state } = signSpotifyOAuthState(
      7,
      "https://karaoke-companion-api.onrender.com"
    );
    const { userId, returnBase } = verifySpotifyOAuthState(state);
    expect(userId).toBe(7);
    expect(returnBase).toBe("https://karaoke-companion-api.onrender.com");
  });

  it("does not embed return base for disallowed origins", () => {
    vi.stubEnv(
      "SPOTIFY_REDIRECT_URI",
      "https://api.example.com/api/spotify/callback"
    );
    vi.stubEnv("PUBLIC_APP_URL", "https://www.example.com");
    const { state } = signSpotifyOAuthState(3, "https://evil.example.com");
    const decoded = jwt.decode(state) as { rb?: string } | null;
    expect(decoded?.rb).toBeUndefined();
  });

  it("embeds return base when Origin matches PUBLIC_APP_URL (split web/API hosts)", () => {
    vi.stubEnv(
      "SPOTIFY_REDIRECT_URI",
      "https://api.example.com/api/spotify/callback"
    );
    vi.stubEnv("PUBLIC_APP_URL", "https://www.example.com");
    const { state } = signSpotifyOAuthState(2, "https://www.example.com");
    const { returnBase } = verifySpotifyOAuthState(state);
    expect(returnBase).toBe("https://www.example.com");
  });

  it("normalizeWebOrigin strips path and rejects non-http(s)", () => {
    expect(normalizeWebOrigin("https://h.example/foo")).toBe("https://h.example");
    expect(normalizeWebOrigin("javascript:alert(1)")).toBeNull();
  });

  it("rejects wrong token type", () => {
    const bad = jwt.sign(
      { typ: "other", sub: 1 },
      process.env.JWT_SECRET || "dev-insecure-change-me"
    );
    expect(() => verifySpotifyOAuthState(bad)).toThrow();
  });

  it("rejects state JWT missing PKCE verifier", () => {
    const bad = jwt.sign(
      { typ: "spotify-oauth", sub: 1 },
      process.env.JWT_SECRET || "dev-insecure-change-me"
    );
    expect(() => verifySpotifyOAuthState(bad)).toThrow();
  });

  it("requests profile scope needed by the /me lookup after OAuth", () => {
    vi.stubEnv("SPOTIFY_CLIENT_ID", "cid");
    vi.stubEnv(
      "SPOTIFY_REDIRECT_URI",
      "https://example.com/api/spotify/callback"
    );

    const url = new URL(buildSpotifyAuthorizeUrl("state", "challenge"));
    const scopes = url.searchParams.get("scope")?.split(" ") ?? [];

    expect(scopes).toContain("user-read-private");
    expect(scopes).toContain("playlist-read-private");
    expect(scopes).toContain("playlist-read-collaborative");
  });
});

describe("refreshSpotifyAccessToken", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("SPOTIFY_CLIENT_ID", "cid");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "sec");
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns new_refresh_token when Spotify sends one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          access_token: "acc",
          expires_in: 3600,
          refresh_token: "rotated",
        })
      )
    );
    const out = await refreshSpotifyAccessToken("old");
    expect(out.access_token).toBe("acc");
    expect(out.new_refresh_token).toBe("rotated");
  });
});

describe("exchangeSpotifyCode", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("SPOTIFY_CLIENT_ID", "cid");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "sec");
    vi.stubEnv(
      "SPOTIFY_REDIRECT_URI",
      "https://example.com/api/spotify/callback"
    );
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("surfaces non-JSON Spotify token errors without a parser failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("The user is not registered in the Developer Dashboard.", {
          status: 400,
          headers: { "content-type": "text/plain" },
        })
      )
    );

    await expect(exchangeSpotifyCode("code", "verifier")).rejects.toThrow(
      "The user is not registered in the Developer Dashboard."
    );
  });
});

describe("fetchSpotifyCurrentUser", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("surfaces Spotify profile errors from string error responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "insufficient_scope" }, 403))
    );

    await expect(fetchSpotifyCurrentUser("access")).rejects.toThrow(
      "insufficient_scope"
    );
  });

  it("surfaces Spotify profile errors from nested error responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ error: { message: "Insufficient client scope" } }, 403)
      )
    );

    await expect(fetchSpotifyCurrentUser("access")).rejects.toThrow(
      "Insufficient client scope"
    );
  });
});

describe("getSpotifyAccessTokenForUser", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("SPOTIFY_CLIENT_ID", "cid");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "sec");
    vi.mocked(db.execute).mockReset();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists rotated refresh token from Spotify", async () => {
    vi.mocked(db.execute)
      .mockResolvedValueOnce({
        rows: [{ spotify_refresh_token: "stored_refresh" }],
      } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          access_token: "acc_tok",
          expires_in: 3600,
          refresh_token: "new_long_refresh",
        })
      )
    );

    const access = await getSpotifyAccessTokenForUser(42);
    expect(access).toBe("acc_tok");
    expect(db.execute).toHaveBeenCalledTimes(2);
    const upd = vi.mocked(db.execute).mock.calls[1]![0] as {
      sql: string;
      args: unknown[];
    };
    expect(upd.sql).toContain("spotify_refresh_token");
    expect(upd.args).toEqual(["new_long_refresh", 42]);
  });

  it("does not UPDATE when Spotify omits refresh_token", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: [{ spotify_refresh_token: "only_refresh" }],
    } as never);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          access_token: "acc2",
          expires_in: 3600,
        })
      )
    );

    await getSpotifyAccessTokenForUser(1);
    expect(db.execute).toHaveBeenCalledTimes(1);
  });
});
