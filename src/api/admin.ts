const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

function apiUrl(path: string): string {
  if (API_BASE) return `${API_BASE}${path}`;
  return path;
}

function getToken(): string | null {
  return localStorage.getItem("karaoke_token");
}

export interface AdminHealthResponse {
  ok: boolean;
  turso: boolean;
  commit: string | null;
  branch: string | null;
  providers: {
    spotifyOAuth: boolean;
    spotifyClientId: boolean;
    spotifyClientSecret: boolean;
    getSongBpm: boolean;
    lastFm: boolean;
  };
}

export async function fetchAdminHealth(): Promise<AdminHealthResponse> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated.");
  const res = await fetch(apiUrl("/api/admin/health"), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as
    | AdminHealthResponse
    | { error?: string };
  if (!res.ok) {
    throw new Error(
      "error" in body && typeof body.error === "string"
        ? body.error
        : "Failed to load admin health."
    );
  }
  return body as AdminHealthResponse;
}
