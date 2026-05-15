import { db } from "./db.js";

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

    await dedupeSongsByUserItunes();
    try {
      await db.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_songs_user_itunes ON songs(user_id, itunes_id)"
      );
    } catch (error) {
      console.error("Could not create songs unique index:", error);
    }

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
