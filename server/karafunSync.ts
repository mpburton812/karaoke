import { db } from "./db.js";

const KARA_URL =
  "https://www.karafun.com/cl/3107312/bc24526ef023397ecac1814014ca8f14/";

function parseSemicolonCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && inQuotes && next === '"') {
      field += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ";" && !inQuotes) {
      fields.push(field.trim());
      field = "";
      continue;
    }
    field += ch;
  }

  fields.push(field.trim());
  return fields;
}

export async function syncKarafunCatalog(): Promise<{
  count: number;
  updatedAt: string;
}> {
  const res = await fetch(KARA_URL, {
    headers: {
      Accept: "text/csv,text/plain,*/*",
      "User-Agent": "KaraokeCompanion/1.0 (https://github.com/mpburton812/karaoke)",
    },
  });
  if (!res.ok) {
    throw new Error(`KaraFun download failed (HTTP ${res.status}).`);
  }

  const csvText = await res.text();
  if (!csvText.trim()) {
    throw new Error("KaraFun download was empty.");
  }

  const lines = csvText.split(/\r?\n/).filter((line) => line.trim() !== "");
  lines.shift();

  const statements = lines
    .map((line) => {
      const parts = parseSemicolonCsvLine(line);
      if (parts.length < 3) return null;
      const id = parseInt(parts[0] ?? "", 10);
      if (!Number.isFinite(id) || id <= 0) return null;
      return {
        sql: "INSERT INTO karafun_catalog (id, title, artist, duration, styles) VALUES (?, ?, ?, ?, ?)",
        args: [
          id,
          parts[1] ?? "",
          parts[2] ?? "",
          parseInt(parts[3] ?? "", 10) || 0,
          parts[7] ?? "",
        ],
      };
    })
    .filter((stmt): stmt is { sql: string; args: Array<string | number> } =>
      Boolean(stmt)
    );

  if (statements.length === 0) {
    throw new Error("KaraFun download did not contain any catalog records.");
  }

  await db.execute("DELETE FROM karafun_catalog");
  const batchSize = 500;
  for (let i = 0; i < statements.length; i += batchSize) {
    await db.batch(statements.slice(i, i + batchSize));
  }

  const updatedAt = new Date().toISOString();
  await db.execute({
    sql: "INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)",
    args: ["karafun_last_updated", updatedAt],
  });

  return { count: statements.length, updatedAt };
}
