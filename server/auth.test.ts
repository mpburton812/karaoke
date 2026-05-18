import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}));

vi.mock("./db.js", () => ({
  db: { execute: mockExecute, batch: vi.fn() },
  tursoConfigured: true,
}));

import {
  changePassword,
  getBearerToken,
  loginUser,
  registerUser,
  signToken,
  verifyToken,
} from "./auth.js";

describe("auth helpers", () => {
  it("signs and verifies JWT payload", () => {
    const token = signToken({ id: 7, username: "alice", accessLevel: "user" });
    expect(verifyToken(token)).toMatchObject({ sub: 7, username: "alice" });
  });

  it("extracts bearer token from Authorization header", () => {
    expect(
      getBearerToken({
        headers: { authorization: "Bearer abc123" },
      } as never)
    ).toBe("abc123");
    expect(getBearerToken({ headers: {} } as never)).toBeNull();
  });
});

describe("registerUser", () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it("rejects short passwords", async () => {
    await expect(registerUser("alice", "short")).rejects.toThrow(/8 characters/);
  });

  it("rejects duplicate usernames", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    await expect(registerUser("alice", "password123")).rejects.toThrow(
      /already exists/
    );
  });

  it("creates user and returns id and username", async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 5, username: "alice", access_level: "user" }],
      })
      .mockResolvedValueOnce({ rows: [], rowsAffected: 1 });

    const user = await registerUser("alice", "password123");
    expect(user).toEqual({ id: 5, username: "alice", accessLevel: "user" });
    expect(mockExecute).toHaveBeenCalledTimes(3);
    expect(mockExecute.mock.calls[2][0]).toMatchObject({
      sql: expect.stringContaining("last_login_at"),
    });
  });
});

describe("loginUser", () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it("rejects unknown user", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] });
    await expect(loginUser("nobody", "password123")).rejects.toThrow(/Invalid/);
  });

  it("rejects wrong password", async () => {
    const hash = await bcrypt.hash("correct", 12);
    mockExecute.mockResolvedValueOnce({
      rows: [{ id: 1, username: "alice", password_hash: hash }],
    });
    await expect(loginUser("alice", "wrongpass1")).rejects.toThrow(/Invalid/);
  });

  it("accepts valid credentials", async () => {
    const hash = await bcrypt.hash("password123", 12);
    mockExecute.mockResolvedValueOnce({
      rows: [{ id: 1, username: "alice", password_hash: hash, access_level: "user" }],
    });
    const user = await loginUser("alice", "password123");
    expect(user).toEqual({ id: 1, username: "alice", accessLevel: "user" });
  });
});

describe("changePassword", () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it("rejects incorrect current password", async () => {
    const hash = await bcrypt.hash("oldpass12", 12);
    mockExecute.mockResolvedValueOnce({
      rows: [{ id: 3, username: "bob", password_hash: hash }],
    });
    await expect(changePassword(3, "wrongpass1", "newpass123")).rejects.toThrow(
      /incorrect/
    );
  });

  it("updates password when current password matches", async () => {
    const hash = await bcrypt.hash("oldpass12", 12);
    mockExecute
      .mockResolvedValueOnce({
        rows: [{ id: 3, username: "bob", password_hash: hash, access_level: "user" }],
      })
      .mockResolvedValueOnce({ rowsAffected: 1 });

    const user = await changePassword(3, "oldpass12", "newpass123");
    expect(user).toEqual({ id: 3, username: "bob", accessLevel: "user" });
    expect(mockExecute).toHaveBeenCalledTimes(2);
    const updateCall = mockExecute.mock.calls[1][0];
    expect(updateCall.sql).toMatch(/UPDATE users SET password_hash/);
  });
});
