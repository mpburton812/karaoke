import cors from "cors";
import express from "express";
import type { InValue } from "@libsql/client";
import { db, tursoConfigured } from "./db.js";
import {
  getBearerToken,
  changePassword,
  loginUser,
  registerUser,
  signToken,
  verifyToken,
} from "./auth.js";
import { assertSqlAllowed } from "./sqlGuard.js";
import {
  spotifyOAuthConfigured,
  signSpotifyOAuthState,
  verifySpotifyOAuthState,
  buildSpotifyAuthorizeUrl,
  exchangeSpotifyCode,
  fetchSpotifyCurrentUser,
  saveSpotifyTokensForUser,
  clearSpotifyForUser,
  getSpotifyLinkStatus,
  getPublicAppUrl,
  getSpotifyEnvPresence,
  getConfiguredSpotifyRedirectUri,
} from "./spotifyAuth.js";
import {
  listSpotifyPlaylists,
  getSyncedPlaylistsForUser,
  syncSpotifyPlaylist,
} from "./spotifyPlaylistSync.js";

function apiIndexPayload(serveStatic: boolean) {
  return {
    name: "Karaoke Companion API",
    status: "running",
    health: "/api/health",
    auth: [
      "/api/auth/register",
      "/api/auth/login",
      "/api/auth/change-password",
      "/api/spotify/connect",
      "/api/spotify/callback",
      "/api/spotify/disconnect",
      "/api/spotify/status",
      "/api/spotify/playlists",
      "/api/spotify/synced-playlists",
      "/api/spotify/sync-playlist",
    ],
    data: ["/api/execute", "/api/batch"],
    note: serveStatic
      ? "Web app is served at / on this host."
      : "Use the web app at http://localhost:5173 — API-only mode on this port.",
  };
}

export function createApp(options: { serveStatic?: boolean } = {}) {
  const { serveStatic = false } = options;
  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "2mb" }));

  const apiIndex = (_req: express.Request, res: express.Response) => {
    res.json(apiIndexPayload(serveStatic));
  };
  // When serving the SPA, reserve / for the web app; API metadata lives at /api.
  app.get(serveStatic ? "/api" : "/", apiIndex);

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      turso: tursoConfigured,
    });
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password } = req.body as {
        username?: string;
        password?: string;
      };
      if (!username || !password) {
        res.status(400).json({ error: "Username and password are required." });
        return;
      }
      const user = await registerUser(username, password);
      const token = signToken(user);
      res.json({ user, token });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed.";
      res.status(400).json({ error: message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body as {
        username?: string;
        password?: string;
      };
      if (!username || !password) {
        res.status(400).json({ error: "Username and password are required." });
        return;
      }
      const user = await loginUser(username, password);
      const token = signToken(user);
      res.json({ user, token });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed.";
      res.status(401).json({ error: message });
    }
  });

  function requireAuth(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    const token = getBearerToken(req);
    if (!token) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    try {
      const payload = verifyToken(token);
      (req as express.Request & { userId: number }).userId = payload.sub;
      next();
    } catch {
      res.status(401).json({ error: "Invalid or expired session." });
    }
  }

  function requireSpotifyOAuth(
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    if (!spotifyOAuthConfigured()) {
      res.status(503).json({
        error:
          "Spotify OAuth is not configured on the server. Set SPOTIFY_* and PUBLIC_APP_URL.",
      });
      return;
    }
    next();
  }

  async function requireSpotifyLinked(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    try {
      const userId = (req as express.Request & { userId: number }).userId;
      const s = await getSpotifyLinkStatus(userId);
      if (!s.linked) {
        res.status(403).json({
          error: "Connect Spotify in Admin before using playlist features.",
        });
        return;
      }
      next();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Spotify link check failed.";
      res.status(500).json({ error: message });
    }
  }

  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body as {
        currentPassword?: string;
        newPassword?: string;
      };
      const userId = (req as express.Request & { userId: number }).userId;

      if (!currentPassword || !newPassword) {
        res.status(400).json({ error: "Current and new password are required." });
        return;
      }

      const user = await changePassword(userId, currentPassword, newPassword);
      const token = signToken(user);
      res.json({ user, token });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Password change failed.";
      const status = message.includes("incorrect") ? 401 : 400;
      res.status(status).json({ error: message });
    }
  });

  app.get("/api/spotify/status", requireAuth, async (req, res) => {
    try {
      const userId = (req as express.Request & { userId: number }).userId;
      const status = await getSpotifyLinkStatus(userId);
      res.json({
        configured: spotifyOAuthConfigured(),
        env: getSpotifyEnvPresence(),
        redirectUri: getConfiguredSpotifyRedirectUri(),
        linked: status.linked,
        spotifyUserId: status.spotifyUserId,
        displayName: status.displayName,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to read Spotify status.";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/spotify/connect", requireAuth, (req, res) => {
    if (!spotifyOAuthConfigured()) {
      res.status(503).json({
        error:
          "Spotify is not configured. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI, and PUBLIC_APP_URL (see README), then restart the API.",
      });
      return;
    }
    try {
      const userId = (req as express.Request & { userId: number }).userId;
      const { state, codeChallenge } = signSpotifyOAuthState(userId);
      const url = buildSpotifyAuthorizeUrl(state, codeChallenge);
      res.json({ url });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start Spotify login.";
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/spotify/callback", async (req, res) => {
    const publicUrl = getPublicAppUrl() || "http://127.0.0.1:5173";
    const redirectWith = (query: Record<string, string>) => {
      const q = new URLSearchParams(query).toString();
      res.redirect(`${publicUrl}/?${q}`);
    };

    const code = typeof req.query.code === "string" ? req.query.code : null;
    const state = typeof req.query.state === "string" ? req.query.state : null;
    const oauthError =
      typeof req.query.error === "string" ? req.query.error : null;

    if (oauthError) {
      const desc =
        typeof req.query.error_description === "string"
          ? req.query.error_description
          : "";
      const reason = desc
        ? `${oauthError}: ${desc}`.slice(0, 400)
        : oauthError;
      redirectWith({ spotify: "error", reason });
      return;
    }
    if (!code || !state) {
      redirectWith({ spotify: "error", reason: "missing_code_or_state" });
      return;
    }
    if (!spotifyOAuthConfigured()) {
      redirectWith({ spotify: "error", reason: "not_configured" });
      return;
    }

    let userId: number;
    let codeVerifier: string;
    try {
      ({ userId, codeVerifier } = verifySpotifyOAuthState(state));
    } catch {
      redirectWith({ spotify: "error", reason: "invalid_state" });
      return;
    }

    try {
      const tokens = await exchangeSpotifyCode(code, codeVerifier);
      const profile = await fetchSpotifyCurrentUser(tokens.access_token);
      await saveSpotifyTokensForUser(
        userId,
        tokens.refresh_token,
        profile.id,
        profile.display_name
      );
      redirectWith({ spotify: "connected" });
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : "token_exchange_failed";
      redirectWith({
        spotify: "error",
        reason: reason.slice(0, 200),
      });
    }
  });

  app.post("/api/spotify/disconnect", requireAuth, async (req, res) => {
    try {
      const userId = (req as express.Request & { userId: number }).userId;
      await clearSpotifyForUser(userId);
      res.json({ ok: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to disconnect Spotify.";
      res.status(500).json({ error: message });
    }
  });

  app.get(
    "/api/spotify/playlists",
    requireAuth,
    requireSpotifyOAuth,
    requireSpotifyLinked,
    async (req, res) => {
      try {
        const userId = (req as express.Request & { userId: number }).userId;
        const playlists = await listSpotifyPlaylists(userId);
        res.json({ playlists });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load playlists.";
        res.status(502).json({ error: message });
      }
    }
  );

  app.get(
    "/api/spotify/synced-playlists",
    requireAuth,
    requireSpotifyOAuth,
    requireSpotifyLinked,
    async (req, res) => {
      try {
        const userId = (req as express.Request & { userId: number }).userId;
        const synced = await getSyncedPlaylistsForUser(userId);
        res.json({ synced });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to read sync history.";
        res.status(500).json({ error: message });
      }
    }
  );

  app.post(
    "/api/spotify/sync-playlist",
    requireAuth,
    requireSpotifyOAuth,
    requireSpotifyLinked,
    async (req, res) => {
      try {
        const userId = (req as express.Request & { userId: number }).userId;
        const { playlistId, playlistUrl } = req.body as {
          playlistId?: string;
          playlistUrl?: string;
        };
        const raw = (playlistUrl ?? playlistId ?? "").trim();
        if (!raw) {
          res.status(400).json({
            error: "Provide playlistId or playlistUrl in the JSON body.",
          });
          return;
        }
        const result = await syncSpotifyPlaylist(userId, raw);
        res.json(result);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Playlist sync failed.";
        const status = message.includes("Invalid") ? 400 : 502;
        res.status(status).json({ error: message });
      }
    }
  );

  app.post("/api/execute", requireAuth, async (req, res) => {
    try {
      const { sql, args = [] } = req.body as { sql?: string; args?: InValue[] };
      const userId = (req as express.Request & { userId: number }).userId;

      if (!sql || typeof sql !== "string") {
        res.status(400).json({ error: "sql is required." });
        return;
      }

      assertSqlAllowed(sql, userId, args);
      const result = await db.execute({ sql, args });
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Query failed.";
      const status =
        message.includes("not allowed") || message.includes("user_id")
          ? 403
          : 500;
      res.status(status).json({ error: message });
    }
  });

  app.post("/api/batch", requireAuth, async (req, res) => {
    try {
      const { statements } = req.body as {
        statements?: Array<string | { sql: string; args?: InValue[] }>;
      };
      const userId = (req as express.Request & { userId: number }).userId;

      if (!Array.isArray(statements)) {
        res.status(400).json({ error: "statements array is required." });
        return;
      }

      const normalized = statements.map((s) => {
        if (typeof s === "string") {
          assertSqlAllowed(s, userId, []);
          return s;
        }
        const args = s.args ?? [];
        assertSqlAllowed(s.sql, userId, args);
        return { sql: s.sql, args };
      });

      const results = await db.batch(normalized);
      res.json({ results });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Batch failed.";
      const status =
        message.includes("not allowed") || message.includes("user_id")
          ? 403
          : 500;
      res.status(status).json({ error: message });
    }
  });

  return app;
}
