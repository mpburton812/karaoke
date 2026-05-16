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
  it("round-trips user id in OAuth state", () => {
    const state = signSpotifyOAuthState(99);
    expect(verifySpotifyOAuthState(state)).toBe(99);
  });

  it("rejects wrong token type", () => {
    const bad = jwt.sign(
      { typ: "other", sub: 1 },
      process.env.JWT_SECRET || "dev-insecure-change-me"
    );
    expect(() => verifySpotifyOAuthState(bad)).toThrow();
  });
});
