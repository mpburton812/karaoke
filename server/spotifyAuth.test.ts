import { describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";

vi.mock("./db.js", () => ({
  db: { execute: vi.fn(), batch: vi.fn() },
  tursoConfigured: true,
}));

import {
  signSpotifyOAuthState,
  verifySpotifyOAuthState,
  isSpotifyRefreshTokenDeadError,
  normalizeWebOrigin,
} from "./spotifyAuth.js";

describe("isSpotifyRefreshTokenDeadError", () => {
  it("detects revoked / invalid_grant style messages", () => {
    expect(isSpotifyRefreshTokenDeadError("Refresh token revoked")).toBe(true);
    expect(isSpotifyRefreshTokenDeadError("invalid_grant")).toBe(true);
    expect(
      isSpotifyRefreshTokenDeadError("The token has been expired or revoked")
    ).toBe(true);
    expect(isSpotifyRefreshTokenDeadError("network timeout")).toBe(false);
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
});
