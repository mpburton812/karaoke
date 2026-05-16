import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { db } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-insecure-change-me";

const SPOTIFY_SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
].join(" ");

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

export function signSpotifyOAuthState(userId: number): {
  state: string;
  codeChallenge: string;
} {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = codeChallengeS256(codeVerifier);
  const state = jwt.sign(
    { typ: "spotify-oauth", sub: userId, pv: codeVerifier },
    JWT_SECRET,
    { expiresIn: "10m" }
  );
  return { state, codeChallenge };
}

export function verifySpotifyOAuthState(token: string): {
  userId: number;
  codeVerifier: string;
} {
  const payload = jwt.verify(token, JWT_SECRET) as {
    typ?: string;
    sub?: number;
    pv?: string;
  };
  if (payload.typ !== "spotify-oauth" || typeof payload.sub !== "number") {
    throw new Error("Invalid OAuth state.");
  }
  const pv = payload.pv;
  if (typeof pv !== "string" || pv.length < 43) {
    throw new Error("Invalid OAuth state.");
  }
  return { userId: payload.sub, codeVerifier: pv };
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

  const data = (await res.json()) as Record<string, unknown>;
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
): Promise<{ access_token: string; expires_in: number }> {
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

  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      typeof data.error_description === "string"
        ? data.error_description
        : "Refresh failed.";
    throw new Error(msg);
  }

  const access_token = data.access_token as string | undefined;
  const expires_in = data.expires_in as number | undefined;
  if (!access_token || typeof expires_in !== "number") {
    throw new Error("Invalid refresh response from Spotify.");
  }
  return { access_token, expires_in };
}

export async function fetchSpotifyCurrentUser(accessToken: string): Promise<{
  id: string;
  display_name: string | null;
}> {
  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json()) as Record<string, unknown>;
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

export async function getSpotifyAccessTokenForUser(userId: number): Promise<string> {
  const refresh = await getSpotifyRefreshTokenOrThrow(userId);
  const { access_token } = await refreshSpotifyAccessToken(refresh);
  return access_token;
}
