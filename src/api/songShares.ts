import { expireSession, shouldExpireSession } from "./session";

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

function apiUrl(path: string): string {
  if (API_BASE) return `${API_BASE}${path}`;
  return path;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  const token = localStorage.getItem("karaoke_token");
  if (!token) {
    throw new Error("Not authenticated. Please log in again.");
  }
  headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(apiUrl(path), { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof body.error === "string" ? body.error : `Request failed (${res.status})`;
    if (shouldExpireSession(res.status, message)) {
      expireSession();
    }
    throw new Error(message);
  }
  return body as T;
}

export interface SongSnapshot {
  track_name: string;
  artist_name: string;
  artwork_url: string | null;
  itunes_id: number | null;
  spotify_track_id: string | null;
  genre: string | null;
  album: string | null;
  release_year: number | null;
  lyrics: string | null;
  duration_ms: number | null;
  key: string | null;
}

export interface SongShareRow {
  id: number;
  senderUserId: number;
  recipientUserId: number;
  senderSongId: number;
  senderUsername: string;
  recipientUsername: string;
  sendMessage: string;
  responseMessage: string | null;
  status: string;
  songSnapshot: SongSnapshot | null;
  introAckAt: string | null;
  previewResolvedAt: string | null;
  respondedAt: string | null;
  senderReplyAckAt: string | null;
  createdAt: string;
}

export interface DirectoryUser {
  id: number;
  username: string;
}

export async function fetchUserDirectory(): Promise<DirectoryUser[]> {
  const { users } = await apiFetch<{ users: DirectoryUser[] }>("/api/users/directory");
  return users;
}

export async function fetchNotificationPreferences(): Promise<{
  notificationsEnabled: boolean;
}> {
  return apiFetch("/api/users/me/preferences");
}

export async function updateNotificationPreferences(
  notificationsEnabled: boolean
): Promise<void> {
  await apiFetch("/api/users/me/preferences", {
    method: "PATCH",
    body: JSON.stringify({ notificationsEnabled }),
  });
}

export async function createSongShare(input: {
  recipientUserId: number;
  songId: number;
  message: string;
}): Promise<{ id: number }> {
  return apiFetch("/api/song-shares", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchShareInbox(): Promise<SongShareRow[]> {
  const { shares } = await apiFetch<{ shares: SongShareRow[] }>("/api/song-shares/inbox");
  return shares;
}

export async function fetchShareOutbox(): Promise<SongShareRow[]> {
  const { shares } = await apiFetch<{ shares: SongShareRow[] }>("/api/song-shares/outbox");
  return shares;
}

export async function fetchIncomingShareNotifications(): Promise<SongShareRow[]> {
  const { shares } = await apiFetch<{ shares: SongShareRow[] }>(
    "/api/song-shares/notifications/incoming"
  );
  return shares;
}

export async function fetchSharesNeedingResponse(): Promise<SongShareRow[]> {
  const { shares } = await apiFetch<{ shares: SongShareRow[] }>(
    "/api/song-shares/notifications/responses-needed"
  );
  return shares;
}

export async function fetchSenderReplyNotifications(): Promise<SongShareRow[]> {
  const { shares } = await apiFetch<{ shares: SongShareRow[] }>(
    "/api/song-shares/notifications/sender-replies"
  );
  return shares;
}

export async function fetchSongShare(shareId: number): Promise<SongShareRow> {
  const { share } = await apiFetch<{ share: SongShareRow }>(
    `/api/song-shares/${shareId}`
  );
  return share;
}

export async function openSongShare(shareId: number): Promise<SongShareRow> {
  const { share } = await apiFetch<{ share: SongShareRow }>(
    `/api/song-shares/${shareId}/open`,
    { method: "POST" }
  );
  return share;
}

export async function acceptSongShare(
  shareId: number
): Promise<{ savedSongId: number }> {
  return apiFetch(`/api/song-shares/${shareId}/accept`, { method: "POST" });
}

export async function discardSongShare(shareId: number): Promise<void> {
  await apiFetch(`/api/song-shares/${shareId}/discard`, { method: "POST" });
}

export async function respondToSongShare(
  shareId: number,
  message: string
): Promise<void> {
  await apiFetch(`/api/song-shares/${shareId}/respond`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function ackSenderReply(shareId: number): Promise<void> {
  await apiFetch(`/api/song-shares/${shareId}/sender-ack`, { method: "POST" });
}

export async function ackShareIntro(shareId: number): Promise<void> {
  await apiFetch(`/api/song-shares/${shareId}/intro-ack`, { method: "POST" });
}
