import { startEnrichmentRun } from "../api/enrichment";
import { KARAOKE_SONGS_REFRESH_EVENT } from "../lib/karaokeEvents";

/** Runs lyrics, MusicBrainz, AcousticBrainz, and other enrichment on the server. */
export async function runEnrichmentForImportedSongIds(
  userId: number,
  songIds: number[]
): Promise<void> {
  void userId;
  await startEnrichmentRun(songIds);
  window.dispatchEvent(new Event(KARAOKE_SONGS_REFRESH_EVENT));
}
