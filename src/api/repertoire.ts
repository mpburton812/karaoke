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

export interface SongRow {
  id: number;
  itunes_id?: number | null;
  spotify_track_id?: string | null;
  spotify_sync_playlist_id?: string | null;
  spotify_source_playlist_name?: string | null;
  track_name: string;
  artist_name: string;
  artwork_url?: string;
  duration_ms?: number;
  release_date?: string;
  explicit?: boolean | number;
  album?: string;
  release_year?: number;
  personal_key?: string;
  vocal_status?: string;
  lyrics?: string;
  genre?: string;
}

export interface PerformanceRow {
  id: number;
  song_id: number;
  date: string;
  location: string;
  notes: string;
  rating: number;
}

export interface TagRow {
  id: number;
  name: string;
  count?: number;
}

export interface LocationRow {
  id: number;
  name: string;
  tag_ids?: string | null;
}

export async function fetchSongs(): Promise<SongRow[]> {
  const { songs } = await apiFetch<{ songs: SongRow[] }>("/api/songs");
  return songs;
}

export async function fetchSong(songId: number): Promise<SongRow | null> {
  const { song } = await apiFetch<{ song: SongRow | null }>(`/api/songs/${songId}`);
  return song;
}

export async function checkDuplicateSong(input: {
  itunesId: number | string;
  trackName: string;
  artistName: string;
}): Promise<{ id?: number; track_name?: string; artist_name?: string } | null> {
  const { existing } = await apiFetch<{
    existing: { id?: number; track_name?: string; artist_name?: string } | null;
  }>("/api/songs/check-duplicate", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return existing;
}

export async function createSong(input: {
  itunesId: number | string;
  trackName: string;
  artistName: string;
  artworkUrl: string;
  durationMs: number;
  releaseDate: string;
  explicit: number;
  album: string;
  releaseYear: number;
  lyrics: string | null;
}): Promise<{ id: number }> {
  return apiFetch("/api/songs", {
    method: "POST",
    body: JSON.stringify({
      itunesId: input.itunesId,
      trackName: input.trackName,
      artistName: input.artistName,
      artworkUrl: input.artworkUrl,
      durationMs: input.durationMs,
      releaseDate: input.releaseDate,
      explicit: input.explicit,
      album: input.album,
      releaseYear: input.releaseYear,
      lyrics: input.lyrics,
    }),
  });
}

export async function patchSong(
  songId: number,
  patch: Partial<Pick<SongRow, "personal_key" | "vocal_status" | "lyrics">>
): Promise<void> {
  await apiFetch(`/api/songs/${songId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteSong(songId: number): Promise<void> {
  await apiFetch(`/api/songs/${songId}`, { method: "DELETE" });
}

export async function fetchSongTags(songId: number): Promise<TagRow[]> {
  const { tags } = await apiFetch<{ tags: TagRow[] }>(`/api/songs/${songId}/tags`);
  return tags;
}

export async function addSongTag(songId: number, tagId: number): Promise<void> {
  await apiFetch(`/api/songs/${songId}/tags`, {
    method: "POST",
    body: JSON.stringify({ tagId }),
  });
}

export async function removeSongTag(songId: number, tagId: number): Promise<void> {
  await apiFetch(`/api/songs/${songId}/tags/${tagId}`, { method: "DELETE" });
}

export async function fetchPerformances(songId: number): Promise<PerformanceRow[]> {
  const { performances } = await apiFetch<{ performances: PerformanceRow[] }>(
    `/api/songs/${songId}/performances`
  );
  return performances;
}

export async function fetchPerformanceTagIds(performanceId: number): Promise<number[]> {
  const { tagIds } = await apiFetch<{ tagIds: number[] }>(
    `/api/performances/${performanceId}/tag-ids`
  );
  return tagIds;
}

export async function createPerformance(
  songId: number,
  input: {
    date: string;
    location: string;
    notes: string;
    rating: number;
    tagIds: number[];
  }
): Promise<{ id: number }> {
  return apiFetch(`/api/songs/${songId}/performances`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updatePerformance(
  performanceId: number,
  input: {
    date: string;
    location: string;
    notes: string;
    rating: number;
    tagIds: number[];
  }
): Promise<void> {
  await apiFetch(`/api/performances/${performanceId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deletePerformance(performanceId: number): Promise<void> {
  await apiFetch(`/api/performances/${performanceId}`, { method: "DELETE" });
}

export async function fetchTags(withCounts = false): Promise<TagRow[]> {
  const q = withCounts ? "?counts=1" : "";
  const { tags } = await apiFetch<{ tags: TagRow[] }>(`/api/tags${q}`);
  return tags;
}

export async function searchSongsByTags(
  tagIds: number[],
  logic: "AND" | "OR"
): Promise<SongRow[]> {
  const { songs } = await apiFetch<{ songs: SongRow[] }>(
    `/api/tags/songs?tagIds=${tagIds.join(",")}&logic=${logic}`
  );
  return songs;
}

export async function createTag(name: string): Promise<void> {
  await apiFetch("/api/tags", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function deleteTag(tagId: number): Promise<void> {
  await apiFetch(`/api/tags/${tagId}`, { method: "DELETE" });
}

export async function fetchLocations(withTagIds = false): Promise<LocationRow[]> {
  const q = withTagIds ? "?withTagIds=1" : "";
  const { locations } = await apiFetch<{ locations: LocationRow[] }>(
    `/api/locations${q}`
  );
  return locations;
}

export async function fetchTagsAndLocations(): Promise<{
  tags: TagRow[];
  locations: LocationRow[];
}> {
  const [tags, locations] = await Promise.all([fetchTags(false), fetchLocations(false)]);
  return { tags, locations };
}

export async function createLocation(name: string): Promise<void> {
  await apiFetch("/api/locations", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function deleteLocation(locationId: number): Promise<void> {
  await apiFetch(`/api/locations/${locationId}`, { method: "DELETE" });
}

export async function fetchLocationTags(locationId: number): Promise<TagRow[]> {
  const { tags } = await apiFetch<{ tags: TagRow[] }>(
    `/api/locations/${locationId}/tags`
  );
  return tags;
}

export async function addLocationTag(
  locationId: number,
  tagId: number
): Promise<void> {
  await apiFetch(`/api/locations/${locationId}/tags`, {
    method: "POST",
    body: JSON.stringify({ tagId }),
  });
}

export async function removeLocationTag(
  locationId: number,
  tagId: number
): Promise<void> {
  await apiFetch(`/api/locations/${locationId}/tags/${tagId}`, {
    method: "DELETE",
  });
}

export async function fetchLocationStats(locationName: string): Promise<{
  daysSung: number;
  totalSongs: number;
  topSongs: { track_name: string; count: number }[];
}> {
  return apiFetch(
    `/api/locations/0/stats?name=${encodeURIComponent(locationName)}`
  );
}

export async function fetchLocationPerformances(
  locationName: string
): Promise<{ track_name: string; date: string }[]> {
  const { performances } = await apiFetch<{
    performances: { track_name: string; date: string }[];
  }>(`/api/locations/performances?name=${encodeURIComponent(locationName)}`);
  return performances;
}

export async function fetchStatsDashboard(): Promise<{
  global: Record<string, unknown>;
  topArtists: { artist_name: string; count: number }[];
  topSongs: {
    id: number;
    track_name: string;
    artist_name: string;
    artwork_url: string;
    count: number;
  }[];
  venues: { location: string; count: number; avgRating: number }[];
  statusHistory: { song_id: number; status: string; changed_at: string }[];
}> {
  return apiFetch("/api/stats/dashboard");
}

export async function fetchAllPerformancesList(): Promise<
  {
    date: string;
    location: string | null;
    track_name: string;
    artist_name: string;
    rating: number | null;
  }[]
> {
  const { performances } = await apiFetch<{
    performances: {
      date: string;
      location: string | null;
      track_name: string;
      artist_name: string;
      rating: number | null;
    }[];
  }>("/api/stats/performances");
  return performances;
}

export async function fetchSongsByRating(): Promise<
  {
    id: number;
    track_name: string;
    artist_name: string;
    artwork_url: string;
    avgRating: number;
    perfCount: number;
  }[]
> {
  const { songs } = await apiFetch<{
    songs: {
      id: number;
      track_name: string;
      artist_name: string;
      artwork_url: string;
      avgRating: number;
      perfCount: number;
    }[];
  }>("/api/stats/songs-by-rating");
  return songs;
}

export type PortabilityTable = "songs" | "tags" | "locations";

export async function exportPortabilityTable(
  table: PortabilityTable
): Promise<Record<string, unknown>[]> {
  const { rows } = await apiFetch<{ rows: Record<string, unknown>[] }>(
    `/api/portability/${table}`
  );
  return rows;
}

export async function importPortabilityTable(
  table: PortabilityTable,
  rows: Record<string, unknown>[]
): Promise<number> {
  const { imported } = await apiFetch<{ imported: number }>(
    `/api/portability/${table}`,
    { method: "POST", body: JSON.stringify({ rows }) }
  );
  return imported;
}

export async function wipeAccountData(): Promise<void> {
  await apiFetch("/api/account/wipe", { method: "POST" });
}
