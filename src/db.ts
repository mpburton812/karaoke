import type { InValue, ResultSet } from "@libsql/client";
import { normalizeResultSet } from "./lib/normalizeResultSet";
import { expireSession, shouldExpireSession } from "./api/session";

export type { InValue, ResultSet };
export { normalizeResultSet };

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

function apiUrl(path: string): string {
  if (API_BASE) return `${API_BASE}${path}`;
  return path;
}

function getToken(): string | null {
  return localStorage.getItem("karaoke_token");
}

async function apiFetch<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {}
): Promise<T> {
  const { auth = true, ...init } = options;
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");

  if (auth) {
    const token = getToken();
    if (!token) {
      throw new Error("Not authenticated. Please log in again.");
    }
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(apiUrl(path), { ...init, headers });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      typeof body.error === "string" ? body.error : `Request failed (${res.status})`;
    if (auth && shouldExpireSession(res.status, message)) {
      expireSession();
    }
    throw new Error(message);
  }

  return body as T;
}

type ExecuteInput = string | { sql: string; args?: InValue[] };

function normalize(input: ExecuteInput): { sql: string; args: InValue[] } {
  if (typeof input === "string") {
    return { sql: input, args: [] };
  }
  return { sql: input.sql, args: input.args ?? [] };
}

export const db = {
  async execute(input: ExecuteInput): Promise<ResultSet> {
    const { sql, args } = normalize(input);
    const result = await apiFetch<ResultSet>("/api/execute", {
      method: "POST",
      body: JSON.stringify({ sql, args }),
    });
    return normalizeResultSet(result);
  },

  async batch(
    statements: Array<string | { sql: string; args?: InValue[] }>
  ): Promise<ResultSet[]> {
    const { results } = await apiFetch<{ results: ResultSet[] }>("/api/batch", {
      method: "POST",
      body: JSON.stringify({ statements }),
    });
    return results.map(normalizeResultSet);
  },
};

export interface WaitForApiOptions {
  maxAttempts?: number;
  intervalMs?: number;
  onProgress?: (attempt: number, maxAttempts: number) => void;
  signal?: AbortSignal;
}

const DEFAULT_WAIT = import.meta.env.PROD
  ? { maxAttempts: 90, intervalMs: 1000 }
  : { maxAttempts: 30, intervalMs: 500 };

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

/** Wait until the API is reachable (schema init runs on the server). */
export async function waitForApi(options: WaitForApiOptions = {}): Promise<void> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_WAIT.maxAttempts;
  const intervalMs = options.intervalMs ?? DEFAULT_WAIT.intervalMs;
  let lastError: Error | null = null;

  for (let i = 0; i < maxAttempts; i++) {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    options.onProgress?.(i + 1, maxAttempts);

    try {
      const res = await fetch(apiUrl("/api/health"), { signal: options.signal });
      if (res.ok) {
        const data = (await res.json()) as { ok?: boolean; turso?: boolean };
        if (data.ok && data.turso) return;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    if (i < maxAttempts - 1) {
      await wait(intervalMs, options.signal);
    }
  }

  const hint = import.meta.env.PROD
    ? "The server did not respond in time. On free Render, the first visit after idle can take up to a minute — try Retry."
    : "Run npm run dev (starts Vite and the API) and check .env.";
  throw lastError ?? new Error(`API server unavailable. ${hint}`);
}
