import { createClient } from "@libsql/client";

const url = import.meta.env.VITE_TURSO_DATABASE_URL;
const authToken = import.meta.env.VITE_TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error("Turso credentials missing in .env file");
}

export const db = createClient({
  url: url || "",
  authToken: authToken || "",
});

export const initDb = async () => {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS songs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        itunes_id INTEGER,
        track_name TEXT,
        artist_name TEXT,
        artwork_url TEXT,
        karafun_available BOOLEAN,
        key TEXT,
        bpm REAL,
        duration_ms INTEGER,
        popularity INTEGER,
        energy REAL,
        danceability REAL,
        happiness REAL,
        acousticness REAL,
        instrumentalness REAL,
        liveness REAL,
        speechiness REAL,
        loudness REAL,
        release_date TEXT,
        explicit BOOLEAN,
        album TEXT
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS karafun_catalog (
        id INTEGER PRIMARY KEY,
        title TEXT,
        artist TEXT,
        duration INTEGER,
        styles TEXT
      )
    `);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_karafun_title_artist ON karafun_catalog (title, artist)`);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS performances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        song_id INTEGER,
        date TEXT,
        time TEXT,
        location TEXT,
        notes TEXT,
        FOREIGN KEY (song_id) REFERENCES songs (id) ON DELETE CASCADE
      )
    `);
  } catch (error) {
    console.error("Error initializing database:", error);
  }
};
