export type SpotifyDiagnosticLevel = "info" | "warn" | "error";

export interface SpotifyDiagnosticEntry {
  id: string;
  at: string;
  level: SpotifyDiagnosticLevel;
  event: string;
  userId: number | null;
  message: string;
  details?: Record<string, unknown>;
}

const MAX_ENTRIES = 100;
const diagnostics: SpotifyDiagnosticEntry[] = [];

function sanitizeDetails(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > 500 ? `${value.slice(0, 500)}...` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitizeDetails);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value)) {
      const lower = key.toLowerCase();
      if (
        lower.includes("token") ||
        lower.includes("secret") ||
        lower.includes("authorization") ||
        lower.includes("code_verifier") ||
        lower === "code" ||
        lower === "state"
      ) {
        out[key] = "[redacted]";
      } else {
        out[key] = sanitizeDetails(raw);
      }
    }
    return out;
  }
  return String(value);
}

export function spotifyErrorDetails(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const details: Record<string, unknown> = {
      name: err.name,
      message: err.message,
    };
    const maybe = err as Error & {
      status?: unknown;
      statusText?: unknown;
      operation?: unknown;
      response?: unknown;
      cause?: unknown;
    };
    if (maybe.status !== undefined) details.status = maybe.status;
    if (maybe.statusText !== undefined) details.statusText = maybe.statusText;
    if (maybe.operation !== undefined) details.operation = maybe.operation;
    if (maybe.response !== undefined) details.response = maybe.response;
    if (maybe.cause instanceof Error) {
      details.cause = {
        name: maybe.cause.name,
        message: maybe.cause.message,
      };
    }
    return sanitizeDetails(details) as Record<string, unknown>;
  }
  return { value: sanitizeDetails(err) };
}

export function recordSpotifyDiagnostic(input: {
  level: SpotifyDiagnosticLevel;
  event: string;
  userId?: number | null;
  message: string;
  details?: Record<string, unknown>;
}): SpotifyDiagnosticEntry {
  const entry: SpotifyDiagnosticEntry = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    level: input.level,
    event: input.event,
    userId: input.userId ?? null,
    message: input.message,
    details: input.details
      ? (sanitizeDetails(input.details) as Record<string, unknown>)
      : undefined,
  };
  diagnostics.unshift(entry);
  diagnostics.splice(MAX_ENTRIES);

  const logger = input.level === "error" ? console.error : input.level === "warn" ? console.warn : console.info;
  logger("[spotify]", JSON.stringify(entry));

  return entry;
}

export function listSpotifyDiagnostics(options: {
  userId: number;
  limit?: number;
}): SpotifyDiagnosticEntry[] {
  const limit = Math.max(1, Math.min(options.limit ?? 25, 50));
  return diagnostics
    .filter((entry) => entry.userId === options.userId || entry.userId === null)
    .slice(0, limit);
}
