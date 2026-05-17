const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

function apiUrl(path: string): string {
  if (API_BASE) return `${API_BASE}${path}`;
  return path;
}

function getToken(): string | null {
  return localStorage.getItem("karaoke_token");
}

export interface EnrichmentStatus {
  running: boolean;
  requested: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  pending: number;
  totalSongs: number;
  currentSong: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  message: string | null;
  errors: string[];
}

async function enrichmentFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = getToken();
  if (!token) {
    throw new Error("Not authenticated.");
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  const res = await fetch(apiUrl(path), { ...init, headers, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof body.error === "string" ? body.error : `Request failed (${res.status})`
    );
  }
  return body as T;
}

export function fetchEnrichmentStatus(): Promise<EnrichmentStatus> {
  return enrichmentFetch<EnrichmentStatus>("/api/enrichment/status");
}

export function startEnrichmentRun(songIds?: number[]): Promise<EnrichmentStatus> {
  return enrichmentFetch<EnrichmentStatus>("/api/enrichment/run", {
    method: "POST",
    body: JSON.stringify(songIds?.length ? { songIds } : {}),
  });
}
