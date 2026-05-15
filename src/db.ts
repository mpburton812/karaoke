import type { InValue, ResultSet } from "@libsql/client";
import { normalizeResultSet } from "./lib/normalizeResultSet";

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

/** Wait until the API is reachable (schema init runs on the server). */
export async function waitForApi(maxAttempts = 30): Promise<void> {
  let lastError: Error | null = null;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(apiUrl("/api/health"));
      if (res.ok) {
        const data = (await res.json()) as { ok?: boolean; turso?: boolean };
        if (data.ok && data.turso) return;
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw (
    lastError ??
    new Error(
      "API server unavailable. Run npm run dev (starts Vite and the API) and check .env."
    )
  );
}
