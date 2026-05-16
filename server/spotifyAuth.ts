import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { db } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-insecure-change-me";

const SPOTIFY_SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
].join(" ");

/** Trimmed redirect URI from env (non-secret); must match Spotify Dashboard exactly. */
export function getConfiguredSpotifyRedirectUri(): string | null {
  const u = process.env.SPOTIFY_REDIRECT_URI?.trim();
  return u || null;
}

export function spotifyOAuthConfigured(): boolean {
  return Boolean(
    process.env.SPOTIFY_CLIENT_ID?.trim() &&
      process.env.SPOTIFY_CLIENT_SECRET?.trim() &&
      process.env.SPOTIFY_REDIRECT_URI?.trim() &&
      getPublicAppUrl()
  );
}

/** Which Spotify-related env vars are set (never exposes values). */
export function getSpotifyEnvPresence(): {
  clientId: boolean;
  clientSecret: boolean;
  redirectUri: boolean;
  publicAppUrl: boolean;
} {
  return {
    clientId: Boolean(process.env.SPOTIFY_CLIENT_ID?.trim()),
    clientSecret: Boolean(process.env.SPOTIFY_CLIENT_SECRET?.trim()),
    redirectUri: Boolean(process.env.SPOTIFY_REDIRECT_URI?.trim()),
    publicAppUrl: Boolean(process.env.PUBLIC_APP_URL?.trim()),
  };
}

/** Where to send the browser after Spotify OAuth (SPA origin). */
export function getPublicAppUrl(): string {
  const explicit = process.env.PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const redir = process.env.SPOTIFY_REDIRECT_URI?.trim();
  if (!redir) return "";
  try {
    const u = new URL(redir);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

/** Origin of SPOTIFY_REDIRECT_URI (API callback host); often same as the SPA when served together. */
export function getSpotifyCallbackOrigin(): string {
  const redir = process.env.SPOTIFY_REDIRECT_URI?.trim();
  if (!redir) return "";
  try {
    return new URL(redir).origin;
  } catch {
    return "";
  }
}

export function normalizeWebOrigin(origin: string): string | null {
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/** Browsers may only return here after OAuth if it matches Connect request Origin or PUBLIC_APP_URL. */
export function isAllowedOAuthReturnOrigin(origin: string): boolean {
  const o = normalizeWebOrigin(origin);
  if (!o) return false;
  const callbackOrigin = getSpotifyCallbackOrigin();
  if (callbackOrigin && o === callbackOrigin) return true;
  const pub = process.env.PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (pub && o === pub) return true;
  return false;
}

/** RFC 7636 PKCE: 43–128 chars from unreserved set; we use URL-safe base64. */
function generateCodeVerifier(): string {
  const raw = crypto.randomBytes(48).toString("base64url").replace(/=+$/, "");
  if (raw.length < 43) {
    return generateCodeVerifier();
  }
  return raw.length > 128 ? raw.slice(0, 128) : raw;
}

function codeChallengeS256(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url").replace(/=+$/, "");
}

export function signSpotifyOAuthState(
  userId: number,
  browserOrigin: string | null = null
): {
  state: string;
  codeChallenge: string;
} {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = codeChallengeS256(codeVerifier);
  const payload: {
    typ: string;
    sub: number;
    pv: string;
    rb?: string;
  } = { typ: "spotify-oauth", sub: userId, pv: codeVerifier };
  if (browserOrigin && isAllowedOAuthReturnOrigin(browserOrigin)) {
    const normalized = normalizeWebOrigin(browserOrigin);
    if (normalized) payload.rb = normalized;
  }
  const state = jwt.sign(payload, JWT_SECRET, { expiresIn: "30m" });
  return { state, codeChallenge };
}

export function verifySpotifyOAuthState(token: string): {
  userId: number;
  codeVerifier: string;
  /** When set, redirect the browser here after OAuth (same tab that started Connect). */
  returnBase?: string;
} {
  const payload = jwt.verify(token, JWT_SECRET) as {
    typ?: string;
    sub?: number;
    pv?: string;
    rb?: string;
  };
  if (payload.typ !== "spotify-oauth" || typeof payload.sub !== "number") {
    throw new Error("Invalid OAuth state.");
  }
  const pv = payload.pv;
  if (typeof pv !== "string" || pv.length < 43) {
    throw new Error("Invalid OAuth state.");
  }
  let returnBase: string | undefined;
  if (typeof payload.rb === "string" && isAllowedOAuthReturnOrigin(payload.rb)) {
    const n = normalizeWebOrigin(payload.rb);
    if (n) returnBase = n;
  }
  return { userId: payload.sub, codeVerifier: pv, returnBase };
}

export function buildSpotifyAuthorizeUrl(
  state: string,
  codeChallenge: string
): string {
  const clientId = process.env.SPOTIFY_CLIENT_ID!.trim();
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI!.trim();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SPOTIFY_SCOPES,
    redirect_uri: redirectUri,
    state,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

function compactResponseText(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 300 ? `${compact.slice(0, 300)}...` : compact;
}

async function readSpotifyJson(
  res: Response,
  invalidJsonMessage: string
): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text.trim()) return {};

  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    if (!res.ok && typeof parsed === "string" && parsed.trim()) {
      return { error_description: compactResponseText(parsed) };
    }
  } catch {
    const responseText = compactResponseText(text);
    if (!res.ok && responseText) {
      return { error_description: responseText };
    }
    throw new Error(
      responseText
        ? `${invalidJsonMessage}: ${responseText}`
        : invalidJsonMessage
    );
  }

  return {};
}

export async function exchangeSpotifyCode(
  code: string,
  codeVerifier: string
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const clientId = process.env.SPOTIFY_CLIENT_ID!.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!.trim();
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI!.trim();

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body,
  });

  const data = await readSpotifyJson(
    res,
    "Invalid token response from Spotify."
  );
  if (!res.ok) {
    const msg =
      typeof data.error_description === "string"
        ? data.error_description
        : typeof data.error === "string"
          ? data.error
          : "Token exchange failed.";
    throw new Error(msg);
  }

  const access_token = data.access_token as string | undefined;
  const refresh_token = data.refresh_token as string | undefined;
  const expires_in = data.expires_in as number | undefined;
  if (!access_token || !refresh_token || typeof expires_in !== "number") {
    throw new Error("Invalid token response from Spotify.");
  }
  return { access_token, refresh_token, expires_in };
}

export async function refreshSpotifyAccessToken(
  refreshToken: string
): Promise<{
  access_token: string;
  expires_in: number;
  /** Spotify may return a new refresh token; the previous one can stop working if ignored. */
  new_refresh_token?: string;
}> {
  const clientId = process.env.SPOTIFY_CLIENT_ID!.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!.trim();

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body,
  });

  const data = await readSpotifyJson(
    res,
    "Invalid refresh response from Spotify."
  );
  if (!res.ok) {
    const msg =
      typeof data.error_description === "string"
        ? data.error_description
        : typeof data.error === "string"
          ? data.error
          : "Refresh failed.";
    throw new Error(msg);
  }

  const access_token = data.access_token as string | undefined;
  const expires_in = data.expires_in as number | undefined;
  const new_refresh_token = data.refresh_token as string | undefined;
  if (!access_token || typeof expires_in !== "number") {
    throw new Error("Invalid refresh response from Spotify.");
  }
  return {
    access_token,
    expires_in,
    new_refresh_token:
      typeof new_refresh_token === "string" && new_refresh_token.length > 0
        ? new_refresh_token
        : undefined,
  };
}

export async function fetchSpotifyCurrentUser(accessToken: string): Promise<{
  id: string;
  display_name: string | null;
}> {
  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await readSpotifyJson(
    res,
    "Invalid profile response from Spotify."
  );
  if (!res.ok) {
    const errObj = data.error as { message?: string } | undefined;
    const msg =
      typeof errObj?.message === "string"
        ? errObj.message
        : "Failed to load Spotify profile.";
    throw new Error(msg);
  }
  return {
    id: String(data.id ?? ""),
    display_name:
      typeof data.display_name === "string" ? data.display_name : null,
  };
}

export async function saveSpotifyTokensForUser(
  userId: number,
  refreshToken: string,
  spotifyUserId: string,
  displayName: string | null
): Promise<void> {
  await db.execute({
    sql: `UPDATE users SET spotify_refresh_token = ?, spotify_user_id = ?, spotify_display_name = ? WHERE id = ?`,
    args: [
      refreshToken,
      spotifyUserId,
      displayName?.trim() ? displayName.trim() : null,
      userId,
    ],
  });
}

export async function clearSpotifyForUser(userId: number): Promise<void> {
  await db.execute({
    sql: `DELETE FROM spotify_synced_playlists WHERE user_id = ?`,
    args: [userId],
  });
  await db.execute({
    sql: `UPDATE users SET spotify_refresh_token = NULL, spotify_user_id = NULL, spotify_display_name = NULL WHERE id = ?`,
    args: [userId],
  });
}

export async function getSpotifyLinkStatus(userId: number): Promise<{
  linked: boolean;
  spotifyUserId: string | null;
  displayName: string | null;
}> {
  const result = await db.execute({
    sql: `SELECT spotify_refresh_token, spotify_user_id, spotify_display_name FROM users WHERE id = ?`,
    args: [userId],
  });
  if (result.rows.length === 0) {
    return { linked: false, spotifyUserId: null, displayName: null };
  }
  const row = result.rows[0] as {
    spotify_refresh_token: string | null;
    spotify_user_id: string | null;
    spotify_display_name: string | null;
  };
  const linked = Boolean(row.spotify_refresh_token);
  return {
    linked,
    spotifyUserId: linked ? row.spotify_user_id : null,
    displayName:
      linked && row.spotify_display_name
        ? row.spotify_display_name
        : null,
  };
}

export async function getSpotifyRefreshTokenOrThrow(userId: number): Promise<string> {
  const result = await db.execute({
    sql: `SELECT spotify_refresh_token FROM users WHERE id = ?`,
    args: [userId],
  });
  const row = result.rows[0] as { spotify_refresh_token: string | null } | undefined;
  const t = row?.spotify_refresh_token?.trim();
  if (!t) {
    throw new Error("Spotify is not linked for this user.");
  }
  return t;
}

/** Spotify token endpoint: treat as dead refresh only for refresh-specific failures. */
export function isSpotifyRefreshTokenDeadError(message: string): boolean {
  const m = message.toLowerCase();
  if (m.includes("invalid_grant")) return true;
  if (m.includes("invalid refresh token")) return true;
  if (m.includes("refresh token revoked")) return true;
  if (m.includes("expired or revoked")) return true;
  if (m.includes("refresh token") && m.includes("revoked")) return true;
  return false;
}

export async function getSpotifyAccessTokenForUser(userId: number): Promise<string> {
  const refresh = await getSpotifyRefreshTokenOrThrow(userId);
  try {
    const { access_token, new_refresh_token } =
      await refreshSpotifyAccessToken(refresh);
    if (new_refresh_token) {
      await db.execute({
        sql: `UPDATE users SET spotify_refresh_token = ? WHERE id = ?`,
        args: [new_refresh_token, userId],
      });
    }
    return access_token;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isSpotifyRefreshTokenDeadError(msg)) {
      await clearSpotifyForUser(userId);
      throw new Error(
        "Spotify connection was revoked or reset (e.g. new Spotify app credentials). Use Admin → Disconnect if shown, then Connect Spotify again.",
        { cause: err }
      );
    }
    throw err;
  }
}
