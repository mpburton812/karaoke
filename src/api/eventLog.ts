import { getStoredToken } from "./auth";
import { expireSession, shouldExpireSession } from "./session";

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

function apiUrl(path: string): string {
  if (API_BASE) return `${API_BASE}${path}`;
  return path;
}

export type EventLevel = "C" | "W" | "I";

export interface EventLogEntry {
  id: number;
  occurredAt: string;
  level: EventLevel;
  userId: number | null;
  username: string | null;
  message: string;
  category: string | null;
}

export interface EventLogListResponse {
  events: EventLogEntry[];
  total: number;
}

async function authedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated.");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body) headers.set("Content-Type", "application/json");

  const res = await fetch(apiUrl(path), { ...init, headers, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof body.error === "string" ? body.error : `Request failed (${res.status})`;
    if (shouldExpireSession(res.status, message)) expireSession();
    throw new Error(message);
  }
  return body as T;
}

export function fetchAdminEventLogs(
  limit: number,
  offset: number
): Promise<EventLogListResponse> {
  return authedFetch<EventLogListResponse>(
    `/api/admin/event-logs?limit=${limit}&offset=${offset}`
  );
}

function postClientEvent(
  message: string,
  category: string | undefined,
  level: EventLevel
): void {
  const text = message.trim();
  if (!text) return;
  void authedFetch<{ ok: boolean }>("/api/events/log", {
    method: "POST",
    body: JSON.stringify({ message: text, category, level }),
  }).catch(() => {
    /* best-effort */
  });
}

/** Client-side informational audit. */
export function logUserAction(message: string, category?: string): void {
  postClientEvent(message, category, "I");
}

/** Client-side critical report (e.g. React error boundary). */
export function logClientCritical(message: string, category?: string): void {
  postClientEvent(message, category ?? "client", "C");
}
