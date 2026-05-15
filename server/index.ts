import "dotenv/config";
import { createApp } from "./app.js";
import { tursoConfigured } from "./db.js";
import { initDb } from "./initDb.js";
import { attachStaticFrontend } from "./static.js";

const PORT = Number(process.env.PORT) || 3001;
const serveStatic =
  process.env.SERVE_STATIC === "true" || process.env.NODE_ENV === "production";

async function start() {
  if (!tursoConfigured) {
    console.error("Cannot start API: Turso credentials missing.");
    process.exit(1);
  }

  await initDb();
  console.log("Database initialized.");

  const app = createApp({ serveStatic });
  if (serveStatic) {
    attachStaticFrontend(app);
    console.log("Serving production frontend from dist/");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`API server listening on port ${PORT}`);
  });
}

start();
