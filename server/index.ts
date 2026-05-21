import "dotenv/config";
import { createApp, registerProcessEventHandlers } from "./app.js";
import { tursoConfigured } from "./db.js";
import { initDb } from "./initDb.js";
import { attachStaticFrontend } from "./static.js";
import { logCatalogEvent, logServerStartup } from "./eventLog.js";

const PORT = Number(process.env.PORT) || 3001;
const serveStatic =
  process.env.SERVE_STATIC === "true" || process.env.NODE_ENV === "production";

async function start() {
  registerProcessEventHandlers();

  if (!tursoConfigured) {
    console.error("Cannot start API: Turso credentials missing.");
    logCatalogEvent("database_connection_failure", {
      message: "Cannot start API: Turso credentials missing.",
    });
    process.exit(1);
  }

  try {
    await initDb();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Database initialization failed:", message);
    logCatalogEvent("database_connection_failure", {
      message: `Database initialization failed: ${message}`,
    });
    process.exit(1);
  }
  console.log("Database initialized.");
  logServerStartup();

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
