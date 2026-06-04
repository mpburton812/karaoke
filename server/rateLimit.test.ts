import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rateLimit.js";

describe("createRateLimiter", () => {
  it("returns 429 after max requests in the window", async () => {
    const app = express();
    app.get(
      "/test",
      createRateLimiter({ windowMs: 60_000, max: 2, keyPrefix: "t" }),
      (_req, res) => res.json({ ok: true })
    );

    expect((await request(app).get("/test")).status).toBe(200);
    expect((await request(app).get("/test")).status).toBe(200);
    const third = await request(app).get("/test");
    expect(third.status).toBe(429);
    expect(third.body.error).toMatch(/Too many requests/);
  });
});
