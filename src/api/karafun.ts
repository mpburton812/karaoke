const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

function apiUrl(path: string): string {
  if (API_BASE) return `${API_BASE}${path}`;
  return path;
}

function getToken(): string | null {
  return localStorage.getItem("karaoke_token");
}

export interface KarafunSyncResult {
  count: number;
  updatedAt: string;
}

export async function syncKarafunCatalog(): Promise<KarafunSyncResult> {
  const token = getToken();
  if (!token) {
    throw new Error("Not authenticated.");
  }
  const res = await fetch(apiUrl("/api/karafun/sync"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as {
    count?: number;
    updatedAt?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(body.error || "KaraFun catalog sync failed.");
  }
  return {
    count: typeof body.count === "number" ? body.count : 0,
    updatedAt:
      typeof body.updatedAt === "string"
        ? body.updatedAt
        : new Date().toISOString(),
  };
}
