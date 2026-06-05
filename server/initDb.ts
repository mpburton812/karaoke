import { syncAdminAccessLevels } from "./adminConfig.js";
import { db } from "./db.js";
import { runSchemaMigrations } from "./schemaMigrations.js";

export const initDb = async () => {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT
      )
    `);

    try {
      await db.execute("ALTER TABLE users ADD COLUMN password_hash TEXT");
    } catch {
      /* column may already exist */
    }

    for (const col of [
      "access_level TEXT DEFAULT 'user'",
      "last_login_at TEXT",
    ]) {
      try {
        await db.execute(`ALTER TABLE users ADD COLUMN ${col}`);
      } catch {
        /* already exists */
      }
    }

    await syncAdminAccessLevels();

    for (const col of [
      "spotify_refresh_token TEXT",
      "spotify_user_id TEXT",
      "spotify_display_name TEXT",
      "notifications_enabled INTEGER DEFAULT 1",
    ]) {
      try {
        await db.execute(`ALTER TABLE users ADD COLUMN ${col}`);
      } catch {
        /* already exists */
      }
    }

    await db.execute(`
      CREATE TABLE IF NOT EXISTS song_shares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_user_id INTEGER NOT NULL,
        recipient_user_id INTEGER NOT NULL,
        sender_song_id INTEGER NOT NULL,
        song_snapshot TEXT NOT NULL,
        send_message TEXT NOT NULL DEFAULT '',
        response_message TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        intro_ack_at TEXT,
        preview_resolved_at TEXT,
        responded_at TEXT,
        sender_reply_ack_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (sender_user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (recipient_user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (sender_song_id) REFERENCES songs (id) ON DELETE CASCADE
      )
    `);

    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_song_shares_recipient
      ON song_shares(recipient_user_id, status, created_at)
    `);

    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_song_shares_sender
      ON song_shares(sender_user_id, created_at)
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
        personal_key TEXT DEFAULT '0',
        vocal_status TEXT DEFAULT 'Practicing',
        lyrics TEXT,
        last_practiced TEXT,
        enriched_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // Migrations for existing columns
    const columns = [
      { name: 'user_id', type: 'INTEGER' },
      { name: 'genre', type: 'TEXT' },
      { name: 'release_year', type: 'INTEGER' },
      { name: 'personal_key', type: "TEXT DEFAULT '0'" },
      { name: 'vocal_status', type: "TEXT DEFAULT 'Practicing'" },
      { name: 'lyrics', type: 'TEXT' },
      { name: 'last_practiced', type: 'TEXT' },
      { name: 'enriched_at', type: 'TEXT' }
    ];

    for (const col of columns) {
      try {
        await db.execute(`ALTER TABLE songs ADD COLUMN ${col.name} ${col.type}`);
      } catch { /* ignore if already exists */ }
    }

    for (const col of [
      "spotify_track_id TEXT",
      "spotify_sync_playlist_id TEXT",
    ]) {
      try {
        await db.execute(`ALTER TABLE songs ADD COLUMN ${col}`);
      } catch {
        /* already exists */
      }
    }

    await db.execute(`
      CREATE TABLE IF NOT EXISTS spotify_synced_playlists (
        user_id INTEGER NOT NULL,
        spotify_playlist_id TEXT NOT NULL,
        playlist_name TEXT,
        snapshot_id TEXT,
        last_synced_at TEXT,
        PRIMARY KEY (user_id, spotify_playlist_id),
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS spotify_playlist_songs (
        user_id INTEGER NOT NULL,
        spotify_playlist_id TEXT NOT NULL,
        song_id INTEGER NOT NULL,
        spotify_track_id TEXT,
        track_name TEXT,
        artist_name TEXT,
        linked_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, spotify_playlist_id, song_id),
        FOREIGN KEY (user_id, spotify_playlist_id)
          REFERENCES spotify_synced_playlists (user_id, spotify_playlist_id)
          ON DELETE CASCADE,
        FOREIGN KEY (song_id) REFERENCES songs (id) ON DELETE CASCADE
      )
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_spotify_playlist_songs_song
      ON spotify_playlist_songs(user_id, song_id)
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_spotify_playlist_songs_track
      ON spotify_playlist_songs(user_id, spotify_track_id)
      WHERE spotify_track_id IS NOT NULL
    `);
    await db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_spotify_playlist_songs_playlist_track
      ON spotify_playlist_songs(user_id, spotify_playlist_id, spotify_track_id)
      WHERE spotify_track_id IS NOT NULL
    `);
    // spotify_playlist_songs FK requires a row in spotify_synced_playlists; songs may
    // have spotify_sync_playlist_id without that parent (e.g. legacy / partial sync).
    await db.execute(`
      INSERT OR IGNORE INTO spotify_synced_playlists (
        user_id, spotify_playlist_id, playlist_name, snapshot_id, last_synced_at
      )
      SELECT DISTINCT s.user_id, s.spotify_sync_playlist_id, NULL, NULL, NULL
      FROM songs s
      WHERE s.spotify_sync_playlist_id IS NOT NULL
        AND s.user_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM users u WHERE u.id = s.user_id)
    `);
    await db.execute(`
      INSERT OR IGNORE INTO spotify_playlist_songs (
        user_id, spotify_playlist_id, song_id, spotify_track_id, track_name, artist_name
      )
      SELECT s.user_id, s.spotify_sync_playlist_id, s.id, s.spotify_track_id, s.track_name, s.artist_name
      FROM songs s
      WHERE s.spotify_sync_playlist_id IS NOT NULL
        AND s.user_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM spotify_synced_playlists p
          WHERE p.user_id = s.user_id AND p.spotify_playlist_id = s.spotify_sync_playlist_id
        )
    `);

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
        UNIQUE(user_id, name),
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    const songTagsSchema = `
      CREATE TABLE song_tags (
        song_id INTEGER,
        tag_id INTEGER,
        PRIMARY KEY (song_id, tag_id),
        FOREIGN KEY (song_id) REFERENCES songs (id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
      )
    `;
    const perfTagsSchema = `
      CREATE TABLE performance_tags (
        performance_id INTEGER,
        tag_id INTEGER,
        PRIMARY KEY (performance_id, tag_id),
        FOREIGN KEY (performance_id) REFERENCES performances (id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
      )
    `;
    const locTagsSchema = `
      CREATE TABLE location_tags (
        location_id INTEGER,
        tag_id INTEGER,
        PRIMARY KEY (location_id, tag_id),
        FOREIGN KEY (location_id) REFERENCES locations (id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
      )
    `;

    // Migration: Handle obsolete 'type' column and its NOT NULL constraint
    try {
      const tableInfo = await db.execute("PRAGMA table_info(tags)");
      const columns = tableInfo.rows;
      const hasType = columns.some(c => c.name === 'type');
      const typeColumn = columns.find(c => c.name === 'type');
      
      // If 'type' exists and is NOT NULL, we need to fix it
      if (hasType && typeColumn && typeColumn.notnull === 1) {
        console.log("Fixing tags table schema: migrating away from NOT NULL 'type' column");
        // The safest way in SQLite to remove a NOT NULL constraint is to recreate the table
        // We MUST also recreate junction tables because they will point to 'tags_old' after rename
        await db.batch([
          "ALTER TABLE tags RENAME TO tags_old",
          `CREATE TABLE tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            name TEXT NOT NULL,
            UNIQUE(user_id, name),
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
          )`,
          "INSERT INTO tags (id, user_id, name) SELECT id, user_id, name FROM tags_old",
          "ALTER TABLE song_tags RENAME TO song_tags_old",
          songTagsSchema,
          "INSERT INTO song_tags SELECT * FROM song_tags_old",
          "ALTER TABLE location_tags RENAME TO location_tags_old",
          locTagsSchema,
          "INSERT INTO location_tags SELECT * FROM location_tags_old",
          "ALTER TABLE performance_tags RENAME TO performance_tags_old",
          perfTagsSchema,
          "INSERT INTO performance_tags SELECT * FROM performance_tags_old",
          "DROP TABLE song_tags_old",
          "DROP TABLE location_tags_old",
          "DROP TABLE performance_tags_old",
          "DROP TABLE tags_old"
        ]);
      } else if (hasType) {
        // If it exists but is nullable, we can just leave it or try to drop it
        try {
          await db.execute("ALTER TABLE tags DROP COLUMN type");
        } catch { /* ignore if DROP COLUMN not supported */ }
      }
    } catch (error) {
      console.error("Migration error for tags table:", error);
    }

    // Repair broken tags associations for users who already ran the incomplete migration
    const repairJunction = async (tableName: string, schema: string) => {
      try {
        const tableCheck = await db.execute(`SELECT sql FROM sqlite_master WHERE name = ?`, [tableName]);
        if (tableCheck.rows.length > 0) {
          const sql = tableCheck.rows[0].sql as string;
          if (sql.includes('tags_old')) {
            console.log(`Repairing ${tableName} (was pointing to tags_old)`);
            await db.batch([
              `ALTER TABLE ${tableName} RENAME TO ${tableName}_broken`,
              schema,
              `INSERT INTO ${tableName} SELECT * FROM ${tableName}_broken`,
              `DROP TABLE ${tableName}_broken`
            ]);
          }
        }
      } catch (err) {
        console.error(`Error repairing ${tableName}:`, err);
      }
    };

    await repairJunction('song_tags', songTagsSchema.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'));
    await repairJunction('location_tags', locTagsSchema.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'));
    await repairJunction('performance_tags', perfTagsSchema.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'));

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

    await db.execute(`
      CREATE TABLE IF NOT EXISTS location_tags (
        location_id INTEGER,
        tag_id INTEGER,
        PRIMARY KEY (location_id, tag_id),
        FOREIGN KEY (location_id) REFERENCES locations (id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS song_status_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        song_id INTEGER,
        status TEXT NOT NULL,
        changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (song_id) REFERENCES songs (id) ON DELETE CASCADE
      )
    `);

    // Migration: Populate history for existing songs if empty
    try {
      const historyCheck = await db.execute("SELECT COUNT(*) as count FROM song_status_history");
      if (Number(historyCheck.rows[0].count) === 0) {
        await db.execute(`
          INSERT INTO song_status_history (song_id, status)
          SELECT id, vocal_status FROM songs
        `);
      }
    } catch (err) {
      console.error("Error populating song_status_history:", err);
    }

    await dedupeSongsByUserItunes();
    try {
      await db.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_songs_user_itunes ON songs(user_id, itunes_id)"
      );
    } catch (error) {
      console.error("Could not create songs unique index:", error);
    }

    await dedupeSongsByUserSpotify();
    try {
      await db.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_songs_user_spotify ON songs(user_id, spotify_track_id) WHERE spotify_track_id IS NOT NULL"
      );
    } catch (error) {
      console.error("Could not create Spotify songs unique index:", error);
    }

    await db.execute(`
      CREATE TABLE IF NOT EXISTS event_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        occurred_at TEXT NOT NULL,
        level TEXT NOT NULL CHECK (level IN ('C', 'W', 'I')),
        user_id INTEGER,
        username TEXT,
        message TEXT NOT NULL,
        category TEXT,
        details TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
      )
    `);
    await db.execute(
      `CREATE INDEX IF NOT EXISTS idx_event_logs_occurred ON event_logs (occurred_at DESC, id DESC)`
    );

    await runSchemaMigrations();

  } catch (error) {
    console.error("Error initializing database:", error);
  }
};

/** Remove duplicate (user_id, itunes_id) rows before adding UNIQUE index. */
async function dedupeSongsByUserItunes() {
  try {
    await db.execute(`
      DELETE FROM songs
      WHERE itunes_id IS NOT NULL
        AND id NOT IN (
          SELECT MIN(id)
          FROM songs
          WHERE itunes_id IS NOT NULL
          GROUP BY user_id, itunes_id
        )
    `);
  } catch (error) {
    console.error("Song deduplication skipped:", error);
  }
}

/** Remove duplicate (user_id, spotify_track_id) rows before adding partial UNIQUE index. */
async function dedupeSongsByUserSpotify() {
  try {
    await db.execute(`
      DELETE FROM songs
      WHERE spotify_track_id IS NOT NULL
        AND id NOT IN (
          SELECT MIN(id)
          FROM songs
          WHERE spotify_track_id IS NOT NULL
          GROUP BY user_id, spotify_track_id
        )
    `);
  } catch (error) {
    console.error("Spotify song deduplication skipped:", error);
  }
}
