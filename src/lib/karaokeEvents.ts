/** Dispatched when the song list should refetch (e.g. after Spotify sync or enrichment). */
export const KARAOKE_SONGS_REFRESH_EVENT = "karaoke-songs-refresh";

/** Dispatched from Tags (etc.) to open a song on the Songs tab (detail + perform). */
export const KARAOKE_OPEN_SONG_EVENT = "karaoke-open-song";

export type KaraokeOpenSongDetail = { songId: number };

/** Dispatched when song share inbox or stats should refresh. */
export const KARAOKE_SHARES_REFRESH_EVENT = "karaoke-shares-refresh";

/** Open a received share preview from the inbox (detail: shareId). */
export const KARAOKE_OPEN_SHARE_EVENT = "karaoke-open-share";

export type KaraokeOpenShareDetail = { shareId: number };
