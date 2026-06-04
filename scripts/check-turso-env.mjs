import "dotenv/config";
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error("MISSING: TURSO_DATABASE_URL and/or TURSO_AUTH_TOKEN");
  process.exit(1);
}

if (!url.startsWith("libsql://")) {
  console.error("INVALID: TURSO_DATABASE_URL should start with libsql://");
  process.exit(1);
}

const client = createClient({ url, authToken });
try {
  const result = await client.execute("SELECT 1 AS ok");
  console.log("OK: Turso connection succeeded");
  console.log("Database host:", new URL(url).hostname);
  console.log("Token length:", authToken.length);
  console.log("Row:", result.rows[0]);
} catch (err) {
  console.error("FAIL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
}
