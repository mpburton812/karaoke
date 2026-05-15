import { beforeEach, describe, expect, it, vi } from "vitest";
import { persistSession } from "./api/auth";
import { setSessionExpiredHandler } from "./api/session";

describe("waitForApi", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("resolves when health returns ok", async () => {
    const { waitForApi } = await import("./db");
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, turso: true }),
    });

    await expect(waitForApi({ maxAttempts: 1, intervalMs: 0 })).resolves.toBeUndefined();
  });

  it("reports progress attempts", async () => {
    const { waitForApi } = await import("./db");
    fetchMock
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, turso: true }),
      });

    const progress: number[] = [];
    await waitForApi({
      maxAttempts: 2,
      intervalMs: 0,
      onProgress: (attempt) => progress.push(attempt),
    });

    expect(progress).toEqual([1, 2]);
  });
});

describe("db apiFetch session expiry", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    persistSession({ id: 1, username: "test" }, "old-token");
    setSessionExpiredHandler(null);
  });

  it("expires session on invalid JWT responses", async () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    const { db } = await import("./db");

    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Invalid or expired session." }),
    });

    await expect(db.execute("SELECT 1")).rejects.toThrow(/session expired/i);
    expect(localStorage.getItem("karaoke_token")).toBeNull();
    expect(handler).toHaveBeenCalled();
  });
});
