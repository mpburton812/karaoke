import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./db.js", () => ({
  db: { execute: vi.fn(), batch: vi.fn() },
  tursoConfigured: true,
}));

import { assertProductionJwtSecret } from "./auth.js";

describe("assertProductionJwtSecret", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does nothing outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("JWT_SECRET", "");
    expect(() => assertProductionJwtSecret()).not.toThrow();
  });

  it("throws in production when JWT_SECRET is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", "");
    expect(() => assertProductionJwtSecret()).toThrow(/JWT_SECRET/);
  });

  it("throws in production when JWT_SECRET is the dev fallback", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", "dev-insecure-change-me");
    expect(() => assertProductionJwtSecret()).toThrow(/JWT_SECRET/);
  });

  it("allows production with a custom secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", "a-long-random-production-secret-value");
    expect(() => assertProductionJwtSecret()).not.toThrow();
  });
});
