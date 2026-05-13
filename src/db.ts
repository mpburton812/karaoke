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
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS songs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
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
        album TEXT,
        genre TEXT,
        release_year INTEGER,
        personal_key TEXT DEFAULT 'Standard',
        vocal_status TEXT DEFAULT 'Practicing',
        lyrics TEXT,
        last_practiced TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // Migrations for existing columns
    const columns = [
      { name: 'user_id', type: 'INTEGER' },
      { name: 'genre', type: 'TEXT' },
      { name: 'release_year', type: 'INTEGER' },
      { name: 'personal_key', type: "TEXT DEFAULT 'Standard'" },
      { name: 'vocal_status', type: "TEXT DEFAULT 'Practicing'" },
      { name: 'lyrics', type: 'TEXT' },
      { name: 'last_practiced', type: 'TEXT' }
    ];

    for (const col of columns) {
      try {
        await db.execute(`ALTER TABLE songs ADD COLUMN ${col.name} ${col.type}`);
      } catch { /* ignore if already exists */ }
    }

    await db.execute(`
      CREATE TABLE IF NOT EXISTS setlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        name TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS setlist_songs (
        setlist_id INTEGER,
        song_id INTEGER,
        display_order INTEGER,
        PRIMARY KEY (setlist_id, song_id),
        FOREIGN KEY (setlist_id) REFERENCES setlists (id) ON DELETE CASCADE,
        FOREIGN KEY (song_id) REFERENCES songs (id) ON DELETE CASCADE
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT
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
        user_id INTEGER,
        date TEXT,
        time TEXT,
        location TEXT,
        notes TEXT,
        FOREIGN KEY (song_id) REFERENCES songs (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // Migration: Add user_id column to performances if it doesn't exist
    try {
      await db.execute("ALTER TABLE performances ADD COLUMN user_id INTEGER");
    } catch {
      // Column might already exist
    }

    // Migration: Add rating column to performances if it doesn't exist
    try {
      await db.execute("ALTER TABLE performances ADD COLUMN rating INTEGER");
    } catch {
      // Column might already exist
    }

    // New tables for Locations and Tags
    await db.execute(`
      CREATE TABLE IF NOT EXISTS locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        name TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        name TEXT NOT NULL,
        type TEXT NOT NULL, -- 'song' or 'performance'
        UNIQUE(user_id, name, type),
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS song_tags (
        song_id INTEGER,
        tag_id INTEGER,
        PRIMARY KEY (song_id, tag_id),
        FOREIGN KEY (song_id) REFERENCES songs (id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS performance_tags (
        performance_id INTEGER,
        tag_id INTEGER,
        PRIMARY KEY (performance_id, tag_id),
        FOREIGN KEY (performance_id) REFERENCES performances (id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
      )
    `);

  } catch (error) {
    console.error("Error initializing database:", error);
  }
};
