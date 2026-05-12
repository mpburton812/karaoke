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
    console.log("Database initialized successfully");
  } catch (error) {
    console.error("Error initializing database:", error);
  }
};
