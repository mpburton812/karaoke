const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

function apiUrl(path: string): string {
  if (API_BASE) return `${API_BASE}${path}`;
  return path;
}

function getToken(): string | null {
  return localStorage.getItem("karaoke_token");
}

export interface SpotifyStatusResponse {
  configured: boolean;
  env: {
    clientId: boolean;
    clientSecret: boolean;
    redirectUri: boolean;
    publicAppUrl: boolean;
  };
  linked: boolean;
  spotifyUserId: string | null;
  displayName: string | null;
}

export async function fetchSpotifyStatus(): Promise<SpotifyStatusResponse> {
  const token = getToken();
  if (!token) {
    throw new Error("Not authenticated.");
  }
  const res = await fetch(apiUrl("/api/spotify/status"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as SpotifyStatusResponse & { error?: string };
  if (!res.ok) {
    throw new Error(body.error || "Failed to load Spotify status.");
  }
  return {
    configured: Boolean(body.configured),
    env: body.env ?? {
      clientId: false,
      clientSecret: false,
      redirectUri: false,
      publicAppUrl: false,
    },
    linked: Boolean(body.linked),
    spotifyUserId: body.spotifyUserId ?? null,
    displayName: body.displayName ?? null,
  };
}

/** Returns Spotify authorize URL; open in same window (full-page redirect). */
export async function getSpotifyConnectUrl(): Promise<string> {
  const token = getToken();
  if (!token) {
    throw new Error("Not authenticated.");
  }
  const res = await fetch(apiUrl("/api/spotify/connect"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as { url?: string; error?: string };
  if (!res.ok) {
    throw new Error(body.error || "Could not start Spotify connection.");
  }
  if (!body.url) {
    throw new Error("Invalid response from server.");
  }
  return body.url;
}

export async function disconnectSpotify(): Promise<void> {
  const token = getToken();
  if (!token) {
    throw new Error("Not authenticated.");
  }
  const res = await fetch(apiUrl("/api/spotify/disconnect"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as { error?: string };
  if (!res.ok) {
    throw new Error(body.error || "Disconnect failed.");
  }
}
