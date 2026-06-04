/** Minimal shape for repertoire list sorting and letter indexing. */
export interface RepertoireTitleRow {
  track_name: string;
  vocal_status?: string;
}

const STATUS_DEFAULT = "Practicing";

/** First bucket for A–Z index: A–Z or "#" for other leading characters. */
export function getLetterBucket(trackName: string): string {
  const trimmed = trackName.trim();
  if (!trimmed) return "#";
  const ch = trimmed[0].toUpperCase();
  if (ch >= "A" && ch <= "Z") return ch;
  return "#";
}

export function sortSongsByTrackName<T extends RepertoireTitleRow>(songs: T[]): T[] {
  return [...songs].sort((a, b) =>
    (a.track_name ?? "").localeCompare(b.track_name ?? "", undefined, {
      sensitivity: "base",
    })
  );
}

function songMatchesStatus(
  song: RepertoireTitleRow,
  statusFilter: string[]
): boolean {
  if (statusFilter.length === 0) return true;
  const status = song.vocal_status || STATUS_DEFAULT;
  return statusFilter.includes(status);
}

/** Counts per letter (A–Z and optional "#") from songs already filtered by status. */
export function buildLetterCounts<T extends RepertoireTitleRow>(
  songs: T[],
  statusFilter: string[] = []
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const song of songs) {
    if (!songMatchesStatus(song, statusFilter)) continue;
    const bucket = getLetterBucket(song.track_name ?? "");
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  return counts;
}

/** Letters to show in the UI: A–Z with count > 0, then "#" if needed. */
export function letterKeysWithCounts(counts: Record<string, number>): string[] {
  const keys: string[] = [];
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i);
    if ((counts[letter] ?? 0) > 0) keys.push(letter);
  }
  if ((counts["#"] ?? 0) > 0) keys.push("#");
  return keys;
}

export function filterRepertoireSongs<T extends RepertoireTitleRow>(
  songs: T[],
  options: {
    searchQuery?: string;
    statusFilter?: string[];
    letterFilter?: string | null;
  }
): T[] {
  const q = (options.searchQuery ?? "").trim().toLowerCase();
  const statusFilter = options.statusFilter ?? [];
  const letter = options.letterFilter;

  return songs.filter((song) => {
    const title = (song.track_name ?? "").toLowerCase();
    const artist = ((song as { artist_name?: string }).artist_name ?? "").toLowerCase();
    if (q && !title.includes(q) && !artist.includes(q)) return false;
    if (!songMatchesStatus(song, statusFilter)) return false;
    if (letter != null && getLetterBucket(song.track_name ?? "") !== letter) {
      return false;
    }
    return true;
  });
}
