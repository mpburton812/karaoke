import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  changePassword,
  clearSession,
  login,
  persistSession,
  register,
} from "./auth";

describe("client auth API", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("login stores session on success", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user: { id: 1, username: "alice" },
        token: "jwt-token",
      }),
    });

    const result = await login("alice", "password123");
    expect(result.token).toBe("jwt-token");
  });

  it("login throws server error message", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Invalid username or password." }),
    });

    await expect(login("alice", "bad")).rejects.toThrow(/Invalid username/);
  });

  it("register posts credentials", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user: { id: 2, username: "bob" },
        token: "jwt-2",
      }),
    });

    await register("bob", "password123");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/register",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ username: "bob", password: "password123" }),
      })
    );
  });

  it("changePassword sends bearer token from storage", async () => {
    persistSession({ id: 5, username: "carol" }, "stored-jwt");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user: { id: 5, username: "carol" },
        token: "new-jwt",
      }),
    });

    const result = await changePassword("oldpass12", "newpass123");

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(options.headers);
    expect(headers.get("Authorization")).toBe("Bearer stored-jwt");
    expect(result.token).toBe("new-jwt");
  });

  it("changePassword fails when not authenticated", async () => {
    clearSession();
    await expect(changePassword("a", "b")).rejects.toThrow(/Not authenticated/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
