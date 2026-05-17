import { db } from "./db.js";

const KARA_URL =
  "https://www.karafun.com/cl/3107312/bc24526ef023397ecac1814014ca8f14/";
const PROXY_URL = `https://api.allorigins.win/get?url=${encodeURIComponent(KARA_URL)}`;

interface CatalogText {
  csvText: string;
  source: string;
  warnings: string[];
}

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

async function fetchDirectCatalog(): Promise<string> {
  const res = await fetch(KARA_URL, {
    headers: {
      Accept: "text/csv,text/plain,*/*",
      "User-Agent": "KaraokeCompanion/1.0 (https://github.com/mpburton812/karaoke)",
    },
  });
  if (!res.ok) {
    throw new Error(`direct HTTP ${res.status}`);
  }
  return res.text();
}

async function fetchProxyCatalog(): Promise<string> {
  const res = await fetch(PROXY_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": "KaraokeCompanion/1.0 (https://github.com/mpburton812/karaoke)",
    },
  });
  if (!res.ok) {
    throw new Error(`proxy HTTP ${res.status}`);
  }
  const data = (await res.json()) as { contents?: unknown; status?: unknown };
  const contents = typeof data.contents === "string" ? data.contents : "";
  if (!contents.trim()) {
    throw new Error("proxy returned empty contents");
  }
  return contents;
}

async function fetchCatalogText(): Promise<CatalogText> {
  try {
    return { csvText: await fetchDirectCatalog(), source: "direct", warnings: [] };
  } catch (directErr) {
    const directMessage =
      directErr instanceof Error ? directErr.message : String(directErr);
    try {
      return {
        csvText: await fetchProxyCatalog(),
        source: "proxy",
        warnings: [`Direct KaraFun download failed: ${directMessage}`],
      };
    } catch (proxyErr) {
      const proxyMessage =
        proxyErr instanceof Error ? proxyErr.message : String(proxyErr);
      throw new Error(
        `KaraFun download failed (${directMessage}; ${proxyMessage}).`,
        { cause: proxyErr }
      );
    }
  }
}

function previewContent(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 320 ? `${compact.slice(0, 320)}...` : compact;
}

export async function syncKarafunCatalog(): Promise<{
  count: number;
  updatedAt: string;
  source: string;
  warnings: string[];
}> {
  const { csvText, source, warnings } = await fetchCatalogText();
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
    throw new Error(
      [
        `KaraFun ${source} download did not contain CSV catalog records.`,
        `Parsed 0 records from ${lines.length} non-empty line(s).`,
        `Existing catalog was not changed.`,
        warnings.length ? `Warnings: ${warnings.join(" | ")}` : "",
        `First content: ${previewContent(csvText) || "[empty]"}`,
      ]
        .filter(Boolean)
        .join(" ")
    );
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

  return { count: statements.length, updatedAt, source, warnings };
}
