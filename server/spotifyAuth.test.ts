import { describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";

vi.mock("./db.js", () => ({
  db: { execute: vi.fn(), batch: vi.fn() },
  tursoConfigured: true,
}));

import {
  signSpotifyOAuthState,
  verifySpotifyOAuthState,
} from "./spotifyAuth.js";

describe("spotifyAuth state JWT", () => {
  it("round-trips user id and PKCE verifier in OAuth state", () => {
    const { state, codeChallenge } = signSpotifyOAuthState(99);
    expect(codeChallenge.length).toBeGreaterThan(10);
    const { userId, codeVerifier } = verifySpotifyOAuthState(state);
    expect(userId).toBe(99);
    expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
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
