/** Dispatched when the song list should refetch (e.g. after Spotify sync or enrichment). */
export const KARAOKE_SONGS_REFRESH_EVENT = "karaoke-songs-refresh";

/** Dispatched from Tags (etc.) to open a song on the Songs tab (detail + perform). */
export const KARAOKE_OPEN_SONG_EVENT = "karaoke-open-song";

export type KaraokeOpenSongDetail = { songId: number };
