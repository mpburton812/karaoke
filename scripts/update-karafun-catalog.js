import { createClient } from "@libsql/client";
import axios from 'axios';
import { parse } from 'csv-parse/sync';

// Initialize DB client using process.env (compatible with GitHub Actions)
const url = process.env.VITE_TURSO_DATABASE_URL;
const authToken = process.env.VITE_TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error("Missing Turso credentials. Ensure VITE_TURSO_DATABASE_URL and VITE_TURSO_AUTH_TOKEN are set.");
  process.exit(1);
}

const db = createClient({
  url: url,
  authToken: authToken,
});

async function updateCatalog() {
  console.log('Fetching KaraFun catalog...');
  try {
    const response = await axios.get('https://www.karafun.com/karaoke-song-list.csv');
    const records = parse(response.data, {
      columns: true,
      skip_empty_lines: true,
      delimiter: ';'
    });

    console.log(`Parsed ${records.length} records. Updating database...`);

    // Clear existing catalog
    await db.execute("DELETE FROM karafun_catalog");

    // Batch insert
    const chunkSize = 500;
    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);
      const statements = chunk.map(r => ({
        sql: "INSERT INTO karafun_catalog (id, title, artist, duration, styles) VALUES (?, ?, ?, ?, ?)",
        args: [
          parseInt(r.Id), 
          r.Title, 
          r.Artist, 
          parseInt(r.Duration), 
          r.Styles
        ]
      }));
      await db.batch(statements);
      
      if (i % 5000 === 0) {
        console.log(`Progress: ${i + chunk.length} / ${records.length}`);
      }
    }

    console.log('Catalog update complete!');
  } catch (error) {
    console.error('Failed to update catalog:', error);
    process.exit(1);
  }
}

updateCatalog();
