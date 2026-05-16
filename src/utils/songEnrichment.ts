import axios from "axios";
import { db } from "../db";
import { KARAOKE_SONGS_REFRESH_EVENT } from "../lib/karaokeEvents";
import { fetchLyrics, cleanText } from "./lyricsService";

const musicBrainzHeaders = {
  Accept: "application/json",
  "User-Agent": "KaraokeCompanion/1.0 (https://github.com/mpburton812/karaoke)",
};

export interface MusicalQualities {
  bpm: number | null;
  key: string;
  energy: number | null;
  danceability: number | null;
  happiness: number | null;
  acousticness: number | null;
  instrumentalness: number | null;
  liveness: number | null;
  speechiness: number | null;
  loudness: number | null;
}

function emptyQualities(): MusicalQualities {
  return {
    bpm: null,
    key: "DNF",
    energy: null,
    danceability: null,
    happiness: null,
    acousticness: null,
    instrumentalness: null,
    liveness: null,
    speechiness: null,
    loudness: null,
  };
}

export async function checkKarafunAvailable(
  trackName: string,
  artistName: string
): Promise<boolean> {
  const cleanTitle = cleanText(trackName);
  const cleanArtist = cleanText(artistName);

  const result = await db.execute({
    sql: `SELECT id FROM karafun_catalog 
          WHERE (title LIKE ? OR ? LIKE '%' || title || '%') 
          AND (artist LIKE ? OR ? LIKE '%' || artist || '%') 
          LIMIT 1`,
    args: [`%${cleanTitle}%`, cleanTitle, `%${cleanArtist}%`, cleanArtist],
  });

  if (result.rows.length > 0) return true;

  const searchQuery = `${cleanTitle} ${cleanArtist}`;
  const karafunSearchUrl = `https://www.karafun.com/search.html?query=${encodeURIComponent(searchQuery)}`;
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(karafunSearchUrl)}`;

  const response = await axios.get(proxyUrl);
  const html = response.data.contents || "";
  const hasSongItems =
    html.includes("song-list__item") || html.includes("karaoke/");
  return (
    hasSongItems ||
    (html.length > 1000 && !html.toLowerCase().includes("no results found"))
  );
}

export async function fetchMusicalQualitiesForNames(
  trackName: string,
  artistName: string
): Promise<MusicalQualities> {
  let qualities = emptyQualities();

  try {
    const mbSearchUrl = `https://musicbrainz.org/ws/2/recording/?query=recording:${encodeURIComponent(trackName)} AND artist:${encodeURIComponent(artistName)}&fmt=json`;
    const mbRes = await axios.get(mbSearchUrl, { headers: musicBrainzHeaders });
    const mbid = mbRes.data.recordings?.[0]?.id;

    if (mbid) {
      try {
        const abUrl = `https://acousticbrainz.org/api/v1/${mbid}/high-level`;
        const abRes = await axios.get(abUrl);
        const data = abRes.data.highlevel;

        if (data) {
          qualities = {
            bpm: null,
            key:
              data.tonal_atonal?.all?.tonal > 0.5
                ? data.key_edma?.all?.key || "DNF"
                : "DNF",
            energy:
              data.mood_acoustic?.all?.acoustic !== undefined
                ? 1 - data.mood_acoustic.all.acoustic
                : null,
            danceability: data.danceability?.all?.danceable || null,
            happiness: data.mood_happy?.all?.happy || null,
            acousticness: data.mood_acoustic?.all?.acoustic || null,
            instrumentalness: data.voice_instrumental?.all?.instrumental || null,
            liveness: null,
            speechiness: data.voice_instrumental?.all?.voice || null,
            loudness: null,
          };
        }
      } catch {
        /* AcousticBrainz optional */
      }
    }
  } catch {
    /* MusicBrainz optional */
  }

  return qualities;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function enrichSpotifyImportedSong(
  userId: number,
  songId: number,
  trackName: string,
  artistName: string
): Promise<void> {
  let kf = false;
  try {
    kf = await checkKarafunAvailable(trackName, artistName);
  } catch {
    /* network / proxy */
  }

  let lyricsText: string | null = null;
  try {
    lyricsText = await fetchLyrics(artistName, trackName);
  } catch {
    /* lyrics optional */
  }

  let qualities = emptyQualities();
  try {
    qualities = await fetchMusicalQualitiesForNames(trackName, artistName);
  } catch {
    /* MB / AB optional */
  }

  await db.execute({
    sql: `UPDATE songs SET
      karafun_available = ?,
      lyrics = COALESCE(?, lyrics),
      key = ?, bpm = ?, energy = ?, danceability = ?, happiness = ?,
      acousticness = ?, instrumentalness = ?, liveness = ?, speechiness = ?, loudness = ?
      WHERE id = ? AND user_id = ?`,
    args: [
      kf ? 1 : 0,
      lyricsText && lyricsText.trim() ? lyricsText.trim() : null,
      qualities.key,
      qualities.bpm,
      qualities.energy,
      qualities.danceability,
      qualities.happiness,
      qualities.acousticness,
      qualities.instrumentalness,
      qualities.liveness,
      qualities.speechiness,
      qualities.loudness,
      songId,
      userId,
    ],
  });
}

/** Runs KaraFun, lyrics, MusicBrainz, and AcousticBrainz enrichment with MusicBrainz-friendly pacing. */
export async function runEnrichmentForImportedSongIds(
  userId: number,
  songIds: number[]
): Promise<void> {
  for (let i = 0; i < songIds.length; i++) {
    if (i > 0) await sleep(1100);
    const songId = songIds[i]!;
    try {
      const res = await db.execute({
        sql: `SELECT id, track_name, artist_name FROM songs WHERE id = ? AND user_id = ?`,
        args: [songId, userId],
      });
      const row = res.rows[0] as unknown as
        | { id: number; track_name: string; artist_name: string }
        | undefined;
      if (!row) continue;
      await enrichSpotifyImportedSong(
        userId,
        row.id,
        row.track_name,
        row.artist_name
      );
    } catch (e) {
      console.warn("[spotify enrichment] song", songId, e);
    }
  }
  window.dispatchEvent(new Event(KARAOKE_SONGS_REFRESH_EVENT));
}
