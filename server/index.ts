import "dotenv/config";
import { createApp } from "./app.js";
import { tursoConfigured } from "./db.js";
import { initDb } from "./initDb.js";

const PORT = Number(process.env.PORT) || 3001;

async function start() {
  if (!tursoConfigured) {
    console.error("Cannot start API: Turso credentials missing.");
    process.exit(1);
  }

  await initDb();
  console.log("Database initialized.");

  const app = createApp();
  app.listen(PORT, () => {
    console.log(`API server listening on http://localhost:${PORT}`);
  });
}

start();
