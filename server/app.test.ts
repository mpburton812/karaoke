import bcrypt from "bcryptjs";
import type { Express } from "express";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecute, mockBatch } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockBatch: vi.fn(),
}));

vi.mock("./db.js", () => ({
  db: { execute: mockExecute, batch: mockBatch },
  tursoConfigured: true,
}));

import { createApp } from "./app.js";
import { signToken } from "./auth.js";

let app: Express;
const USER_ID = 42;

beforeAll(() => {
  app = createApp();
});

describe("API routes", () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockBatch.mockReset();
  });

  describe("GET /api/health", () => {
    it("returns ok and turso status", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, turso: true });
    });
  });

  describe("POST /api/auth/login", () => {
    it("returns 400 when fields are missing", async () => {
      const res = await request(app).post("/api/auth/login").send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/required/i);
    });

    it("returns token for valid credentials", async () => {
      const hash = await bcrypt.hash("password123", 12);
      mockExecute.mockResolvedValueOnce({
        rows: [{ id: USER_ID, username: "tester", password_hash: hash }],
      });

      const res = await request(app)
        .post("/api/auth/login")
        .send({ username: "tester", password: "password123" });

      expect(res.status).toBe(200);
      expect(res.body.user).toEqual({ id: USER_ID, username: "tester" });
      expect(typeof res.body.token).toBe("string");
    });
  });

  describe("POST /api/auth/change-password", () => {
    it("requires authentication", async () => {
      const res = await request(app)
        .post("/api/auth/change-password")
        .send({ currentPassword: "a", newPassword: "b" });
      expect(res.status).toBe(401);
    });

    it("changes password for authenticated user", async () => {
      const hash = await bcrypt.hash("oldpass12", 12);
      mockExecute
        .mockResolvedValueOnce({
          rows: [{ id: USER_ID, username: "tester", password_hash: hash }],
        })
        .mockResolvedValueOnce({ rowsAffected: 1 });

      const token = signToken({ id: USER_ID, username: "tester" });
      const res = await request(app)
        .post("/api/auth/change-password")
        .set("Authorization", `Bearer ${token}`)
        .send({ currentPassword: "oldpass12", newPassword: "newpass123" });

      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe("tester");
      expect(typeof res.body.token).toBe("string");
    });
  });

  describe("POST /api/execute", () => {
    it("requires authentication", async () => {
      const res = await request(app)
        .post("/api/execute")
        .send({ sql: "SELECT 1", args: [] });
      expect(res.status).toBe(401);
    });

    it("rejects DELETE without user_id scope", async () => {
      const token = signToken({ id: USER_ID, username: "tester" });
      const res = await request(app)
        .post("/api/execute")
        .set("Authorization", `Bearer ${token}`)
        .send({ sql: "DELETE FROM songs WHERE id = ?", args: [1] });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/user_id/);
    });

    it("runs allowed scoped DELETE", async () => {
      mockExecute.mockResolvedValueOnce({
        columns: [],
        columnTypes: [],
        rows: [],
        rowsAffected: 1,
        lastInsertRowid: null,
      });

      const token = signToken({ id: USER_ID, username: "tester" });
      const res = await request(app)
        .post("/api/execute")
        .set("Authorization", `Bearer ${token}`)
        .send({
          sql: "DELETE FROM songs WHERE id = ? AND user_id = ?",
          args: [1, USER_ID],
        });

      expect(res.status).toBe(200);
      expect(res.body.rowsAffected).toBe(1);
    });
  });

  describe("POST /api/batch", () => {
    it("rejects batch with unscoped user delete", async () => {
      const token = signToken({ id: USER_ID, username: "tester" });
      const res = await request(app)
        .post("/api/batch")
        .set("Authorization", `Bearer ${token}`)
        .send({
          statements: [
            {
              sql: "DELETE FROM performances WHERE id = ?",
              args: [9],
            },
          ],
        });

      expect(res.status).toBe(403);
    });

    it("runs batch with scoped statements", async () => {
      mockBatch.mockResolvedValueOnce([
        { rowsAffected: 1, columns: [], columnTypes: [], rows: [], lastInsertRowid: null },
      ]);

      const token = signToken({ id: USER_ID, username: "tester" });
      const res = await request(app)
        .post("/api/batch")
        .set("Authorization", `Bearer ${token}`)
        .send({
          statements: [
            {
              sql: "DELETE FROM songs WHERE user_id = ?",
              args: [USER_ID],
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(1);
    });
  });
});
