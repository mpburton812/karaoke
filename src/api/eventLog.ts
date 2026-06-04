import { getEventDefinition, type EventCode } from "../lib/eventCatalog";
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

export async function downloadAdminEventLogsCsv(): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated.");
  const res = await fetch(apiUrl("/api/admin/event-logs/export"), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      typeof body.error === "string" ? body.error : `Export failed (${res.status})`
    );
  }
  const blob = await res.blob();
  const stamp = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `event-logs-${stamp}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function clearAdminEventLogs(): Promise<{ ok: boolean; deleted: number }> {
  return authedFetch<{ ok: boolean; deleted: number }>("/api/admin/event-logs", {
    method: "DELETE",
  });
}

function postClientEvent(
  event: EventCode,
  message: string
): void {
  const text = message.trim();
  if (!text) return;
  void authedFetch<{ ok: boolean }>("/api/events/log", {
    method: "POST",
    body: JSON.stringify({ message: text, event }),
  }).catch(() => {
    /* best-effort */
  });
}

/** Client-side catalogued informational event. */
export function logCatalogClientEvent(
  event: EventCode,
  message?: string
): void {
  const def = getEventDefinition(event);
  const text = (message?.trim() || def?.label || event).slice(0, 500);
  postClientEvent(event, text);
}

/** @deprecated Prefer {@link logCatalogClientEvent} with a catalog event code. */
export function logUserAction(message: string, category?: string): void {
  const legacy: Record<string, EventCode> = {
    auth: "feature_utilization_metrics",
    release: "application_configuration_load_success",
    data: "feature_utilization_metrics",
    client: "component_ui_rendering_event",
  };
  const event =
    category && legacy[category] ? legacy[category] : "feature_utilization_metrics";
  postClientEvent(event, message);
}

/** Client-side critical report (e.g. React error boundary). */
export function logClientCritical(message: string): void {
  postClientEvent("uncaught_runtime_exception", message);
}
