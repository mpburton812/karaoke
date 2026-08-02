import { db } from "./db.js";

export async function ensureSchemaMigrationsTable(): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
}

async function hasMigration(id: string): Promise<boolean> {
  const res = await db.execute({
    sql: "SELECT 1 FROM schema_migrations WHERE id = ? LIMIT 1",
    args: [id],
  });
  return res.rows.length > 0;
}

async function recordMigration(id: string): Promise<void> {
  await db.execute({
    sql: "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)",
    args: [id, new Date().toISOString()],
  });
}

async function applyMigration(
  id: string,
  run: () => Promise<void>
): Promise<void> {
  if (await hasMigration(id)) return;
  await run();
  await recordMigration(id);
}

/** One-time data and schema cleanup (safe to skip on failure). */
export async function runSchemaMigrations(): Promise<void> {
  await ensureSchemaMigrationsTable();

  await applyMigration("001_karafun_genre_cleanup", async () => {
    await db.execute(`DROP TABLE IF EXISTS karafun_catalog`);
    try {
      await db.execute(`DELETE FROM metadata WHERE key = 'karafun_last_updated'`);
    } catch {
      /* metadata table may not exist yet */
    }
    await db.execute(`
      DELETE FROM song_tags
      WHERE rowid IN (
        SELECT st.rowid FROM song_tags st
        INNER JOIN songs s ON s.id = st.song_id
        INNER JOIN tags t ON t.id = st.tag_id
        WHERE s.genre IS NOT NULL
          AND lower(trim(t.name)) = lower(trim(s.genre))
      )
    `);
    await db.execute(`UPDATE songs SET genre = NULL WHERE genre IS NOT NULL`);
  });

  await applyMigration("002_drop_unused_tables", async () => {
    await db.execute(`DROP TABLE IF EXISTS setlist_songs`);
    await db.execute(`DROP TABLE IF EXISTS setlists`);
    await db.execute(`DROP TABLE IF EXISTS metadata`);
  });

  await applyMigration("003_align_personal_key", async () => {
    await db.execute(`
      UPDATE songs SET personal_key = '0'
      WHERE personal_key IS NULL OR trim(personal_key) = '' OR personal_key = 'Standard'
    `);
  });

  await applyMigration("004_mpburton_practicing_to_considering", async () => {
    const userRes = await db.execute({
      sql: "SELECT id FROM users WHERE username = ? LIMIT 1",
      args: ["mpburton"],
    });
    const userId = Number((userRes.rows[0] as { id?: number } | undefined)?.id);
    if (!Number.isFinite(userId) || userId <= 0) return;

    const songsRes = await db.execute({
      sql: `SELECT id FROM songs
            WHERE user_id = ? AND vocal_status = 'Practicing'`,
      args: [userId],
    });

    for (const row of songsRes.rows) {
      const songId = Number((row as { id?: number }).id);
      if (!Number.isFinite(songId) || songId <= 0) continue;
      await db.execute({
        sql: `UPDATE songs SET vocal_status = 'Considering' WHERE id = ? AND user_id = ?`,
        args: [songId, userId],
      });
      await db.execute({
        sql: `INSERT INTO song_status_history (song_id, status) VALUES (?, 'Considering')`,
        args: [songId],
      });
    }
  });
}
