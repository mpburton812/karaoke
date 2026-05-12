import { db } from './src/db.js';
import axios from 'axios';
import { parse } from 'csv-parse/sync';

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

    // We use a transaction for speed and safety
    // Note: This script assumes environment variables for Turso are set in the GitHub Action
    
    // Clear existing catalog (or use a temporary table for atomic switch)
    await db.execute("DELETE FROM karafun_catalog");

    // Batch insert (Turso/LibSQL handles this well)
    // We'll chunk them to avoid payload size limits
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
      console.log(`Progress: ${i + chunk.length} / ${records.length}`);
    }

    console.log('Catalog update complete!');
  } catch (error) {
    console.error('Failed to update catalog:', error);
    process.exit(1);
  }
}

updateCatalog();
