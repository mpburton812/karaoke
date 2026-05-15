import { createClient } from "@libsql/client";

const url =
  process.env.TURSO_DATABASE_URL || process.env.VITE_TURSO_DATABASE_URL;
const authToken =
  process.env.TURSO_AUTH_TOKEN || process.env.VITE_TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error(
    "Missing Turso credentials. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN."
  );
}

export const db = createClient({
  url: url || "",
  authToken: authToken || "",
});

export const tursoConfigured = Boolean(url && authToken);
