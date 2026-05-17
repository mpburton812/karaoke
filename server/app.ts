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
  deleteImportedSongsForSpotifyPlaylist,
} from "./spotifyPlaylistSync.js";
import {
  listSpotifyDiagnostics,
  recordSpotifyDiagnostic,
  spotifyErrorDetails,
} from "./spotifyDiagnostics.js";
import {
  getEnrichmentStatus,
  startEnrichmentJob,
} from "./songEnrichment.js";

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
      "/api/spotify/diagnostics",
      "/api/spotify/playlists",
      "/api/spotify/synced-playlists",
      "/api/spotify/sync-playlist",
      "/api/spotify/delete-imported-songs",
      "/api/enrichment/status",
      "/api/enrichment/run",
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

  /** Avoid 304 / disk cache on API JSON (Spotify status looked "not linked" after OAuth). */
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      res.setHeader(
        "Cache-Control",
        "private, no-store, no-cache, must-revalidate"
      );
      res.setHeader("Pragma", "no-cache");
    }
    next();
  });

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

  app.get("/api/enrichment/status", requireAuth, async (req, res) => {
    try {
      const userId = (req as express.Request & { userId: number }).userId;
      res.json(await getEnrichmentStatus(userId));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to read enrichment status.";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/enrichment/run", requireAuth, async (req, res) => {
    try {
      const userId = (req as express.Request & { userId: number }).userId;
      const rawSongIds = (req.body as { songIds?: unknown }).songIds;
      const songIds = Array.isArray(rawSongIds)
        ? rawSongIds
            .map((v) => (typeof v === "number" ? v : Number(v)))
            .filter((v) => Number.isFinite(v) && v > 0)
        : undefined;
      res.json(await startEnrichmentJob(userId, songIds));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start enrichment.";
      res.status(500).json({ error: message });
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

  app.get("/api/spotify/diagnostics", requireAuth, (req, res) => {
    const userId = (req as express.Request & { userId: number }).userId;
    const rawLimit =
      typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    res.json({
      diagnostics: listSpotifyDiagnostics({
        userId,
        limit: Number.isFinite(rawLimit) ? rawLimit : undefined,
      }),
    });
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
      const originHeader = req.get("origin");
      const browserOrigin =
        typeof originHeader === "string" && originHeader.trim()
          ? originHeader.trim()
          : null;
      const { state, codeChallenge } = signSpotifyOAuthState(
        userId,
        browserOrigin
      );
      const url = buildSpotifyAuthorizeUrl(state, codeChallenge);
      recordSpotifyDiagnostic({
        level: "info",
        event: "oauth.connect.created",
        userId,
        message: "Created Spotify authorization URL.",
        details: {
          browserOrigin,
          redirectUri: getConfiguredSpotifyRedirectUri(),
          userAgent: req.get("user-agent") ?? null,
        },
      });
      res.json({ url });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start Spotify login.";
      recordSpotifyDiagnostic({
        level: "error",
        event: "oauth.connect.failed",
        userId: (req as express.Request & { userId: number }).userId,
        message,
        details: spotifyErrorDetails(err),
      });
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/spotify/callback", async (req, res) => {
    const fallbackPublic = getPublicAppUrl() || "http://127.0.0.1:5173";

    const stateParam =
      typeof req.query.state === "string" ? req.query.state : null;
    let oauthContext: ReturnType<typeof verifySpotifyOAuthState> | null = null;
    if (stateParam) {
      try {
        oauthContext = verifySpotifyOAuthState(stateParam);
      } catch (err) {
        recordSpotifyDiagnostic({
          level: "warn",
          event: "oauth.callback.invalid_state",
          message: "Spotify OAuth callback had an invalid state token.",
          details: spotifyErrorDetails(err),
        });
        oauthContext = null;
      }
    }

    const baseForRedirect = oauthContext?.returnBase ?? fallbackPublic;
    const redirectWith = (query: Record<string, string>) => {
      const q = new URLSearchParams(query).toString();
      res.setHeader(
        "Cache-Control",
        "private, no-store, no-cache, must-revalidate"
      );
      res.setHeader("Pragma", "no-cache");
      res.redirect(`${baseForRedirect}/?${q}`);
    };

    const code = typeof req.query.code === "string" ? req.query.code : null;
    const state = stateParam;
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
      recordSpotifyDiagnostic({
        level: "warn",
        event: "oauth.callback.spotify_error",
        userId: oauthContext?.userId ?? null,
        message: reason,
        details: {
          error: oauthError,
          errorDescription: desc || null,
          returnBase: baseForRedirect,
          userAgent: req.get("user-agent") ?? null,
        },
      });
      redirectWith({ spotify: "error", reason });
      return;
    }
    if (!code || !state) {
      recordSpotifyDiagnostic({
        level: "warn",
        event: "oauth.callback.missing_params",
        userId: oauthContext?.userId ?? null,
        message: "Spotify OAuth callback was missing code or state.",
        details: {
          hasCode: Boolean(code),
          hasState: Boolean(state),
          returnBase: baseForRedirect,
        },
      });
      redirectWith({ spotify: "error", reason: "missing_code_or_state" });
      return;
    }
    if (!spotifyOAuthConfigured()) {
      recordSpotifyDiagnostic({
        level: "error",
        event: "oauth.callback.not_configured",
        userId: oauthContext?.userId ?? null,
        message: "Spotify OAuth callback reached an unconfigured server.",
        details: {
          env: getSpotifyEnvPresence(),
          redirectUri: getConfiguredSpotifyRedirectUri(),
        },
      });
      redirectWith({ spotify: "error", reason: "not_configured" });
      return;
    }

    if (!oauthContext) {
      recordSpotifyDiagnostic({
        level: "warn",
        event: "oauth.callback.invalid_state_redirect",
        message: "Spotify OAuth callback could not be tied to a user.",
        details: {
          hasState: Boolean(state),
          returnBase: baseForRedirect,
        },
      });
      redirectWith({ spotify: "error", reason: "invalid_state" });
      return;
    }

    const { userId, codeVerifier } = oauthContext;

    try {
      const tokens = await exchangeSpotifyCode(code, codeVerifier);
      const profile = await fetchSpotifyCurrentUser(tokens.access_token);
      await saveSpotifyTokensForUser(
        userId,
        tokens.refresh_token,
        profile.id,
        profile.display_name
      );
      recordSpotifyDiagnostic({
        level: "info",
        event: "oauth.callback.connected",
        userId,
        message: "Spotify account connected successfully.",
        details: {
          spotifyUserId: profile.id,
          hasDisplayName: Boolean(profile.display_name),
        },
      });
      redirectWith({ spotify: "connected" });
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : "token_exchange_failed";
      recordSpotifyDiagnostic({
        level: "error",
        event: "oauth.callback.failed",
        userId,
        message: reason,
        details: spotifyErrorDetails(err),
      });
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

  app.post(
    "/api/spotify/delete-imported-songs",
    requireAuth,
    requireSpotifyOAuth,
    requireSpotifyLinked,
    async (req, res) => {
      try {
        const userId = (req as express.Request & { userId: number }).userId;
        const raw = (req.body as { spotifyPlaylistId?: string })
          .spotifyPlaylistId;
        const spotifyPlaylistId =
          typeof raw === "string" ? raw.trim() : "";
        if (!spotifyPlaylistId) {
          res.status(400).json({
            error: "Provide spotifyPlaylistId in the JSON body.",
          });
          return;
        }
        const { deleted } = await deleteImportedSongsForSpotifyPlaylist(
          userId,
          spotifyPlaylistId
        );
        res.json({ deleted });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete imported songs.";
        res.status(500).json({ error: message });
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
