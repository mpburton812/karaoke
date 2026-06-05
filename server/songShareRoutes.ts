import type { Express, Request, Response, NextFunction } from "express";
import {
  SongShareError,
  acceptSongShare,
  ackSenderReply,
  ackShareIntro,
  createSongShare,
  discardSongShare,
  getSongShare,
  listIncomingShareNotifications,
  listInboxShares,
  listOutboxShares,
  listPendingShareResponses,
  listSenderReplyNotifications,
  listUserDirectory,
  openSongShare,
  respondToSongShare,
  setNotificationsEnabled,
  getNotificationsEnabled,
  getShareStats,
} from "./songShares.js";

type AuthedRequest = Request & { userId: number };

function userId(req: Request): number {
  return (req as AuthedRequest).userId;
}

function handleSongShareError(err: unknown, res: Response): void {
  if (err instanceof SongShareError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : "Request failed.";
  res.status(500).json({ error: message });
}

export function registerSongShareRoutes(
  app: Express,
  middleware: {
    requireAuth: (
      req: Request,
      res: Response,
      next: NextFunction
    ) => void;
    repertoireRateLimit: (
      req: Request,
      res: Response,
      next: NextFunction
    ) => void;
  }
): void {
  const { requireAuth, repertoireRateLimit } = middleware;
  const guard = [requireAuth, repertoireRateLimit] as const;

  app.get("/api/users/directory", ...guard, async (req, res) => {
    try {
      const users = await listUserDirectory(userId(req));
      res.json({ users });
    } catch (err) {
      handleSongShareError(err, res);
    }
  });

  app.get("/api/users/me/preferences", ...guard, async (req, res) => {
    try {
      const notificationsEnabled = await getNotificationsEnabled(userId(req));
      res.json({ notificationsEnabled });
    } catch (err) {
      handleSongShareError(err, res);
    }
  });

  app.patch("/api/users/me/preferences", ...guard, async (req, res) => {
    try {
      const { notificationsEnabled } = req.body as {
        notificationsEnabled?: boolean;
      };
      if (typeof notificationsEnabled !== "boolean") {
        res.status(400).json({ error: "notificationsEnabled boolean is required." });
        return;
      }
      await setNotificationsEnabled(userId(req), notificationsEnabled);
      res.json({ ok: true, notificationsEnabled });
    } catch (err) {
      handleSongShareError(err, res);
    }
  });

  app.get("/api/users/me/share-stats", ...guard, async (req, res) => {
    try {
      const stats = await getShareStats(userId(req));
      res.json(stats);
    } catch (err) {
      handleSongShareError(err, res);
    }
  });

  app.post("/api/song-shares", ...guard, async (req, res) => {
    try {
      const body = req.body as {
        recipientUserId?: number;
        songId?: number;
        message?: string;
      };
      const recipientUserId = Number(body.recipientUserId);
      const songId = Number(body.songId);
      if (!Number.isInteger(recipientUserId) || recipientUserId <= 0) {
        res.status(400).json({ error: "recipientUserId is required." });
        return;
      }
      if (!Number.isInteger(songId) || songId <= 0) {
        res.status(400).json({ error: "songId is required." });
        return;
      }
      const created = await createSongShare(userId(req), {
        recipientUserId,
        songId,
        message: body.message ?? "",
      });
      res.status(201).json(created);
    } catch (err) {
      handleSongShareError(err, res);
    }
  });

  app.get("/api/song-shares/inbox", ...guard, async (req, res) => {
    try {
      const shares = await listInboxShares(userId(req));
      res.json({ shares });
    } catch (err) {
      handleSongShareError(err, res);
    }
  });

  app.get("/api/song-shares/outbox", ...guard, async (req, res) => {
    try {
      const shares = await listOutboxShares(userId(req));
      res.json({ shares });
    } catch (err) {
      handleSongShareError(err, res);
    }
  });

  app.get("/api/song-shares/notifications/incoming", ...guard, async (req, res) => {
    try {
      const shares = await listIncomingShareNotifications(userId(req));
      res.json({ shares });
    } catch (err) {
      handleSongShareError(err, res);
    }
  });

  app.get("/api/song-shares/notifications/responses-needed", ...guard, async (req, res) => {
    try {
      const shares = await listPendingShareResponses(userId(req));
      res.json({ shares });
    } catch (err) {
      handleSongShareError(err, res);
    }
  });

  app.get("/api/song-shares/notifications/sender-replies", ...guard, async (req, res) => {
    try {
      const shares = await listSenderReplyNotifications(userId(req));
      res.json({ shares });
    } catch (err) {
      handleSongShareError(err, res);
    }
  });

  app.get("/api/song-shares/:shareId", ...guard, async (req, res) => {
    try {
      const shareId = Number(req.params.shareId);
      const share = await getSongShare(userId(req), shareId);
      if (!share) {
        res.status(404).json({ error: "Share not found." });
        return;
      }
      res.json({ share });
    } catch (err) {
      handleSongShareError(err, res);
    }
  });

  app.post("/api/song-shares/:shareId/intro-ack", ...guard, async (req, res) => {
    try {
      await ackShareIntro(userId(req), Number(req.params.shareId));
      res.json({ ok: true });
    } catch (err) {
      handleSongShareError(err, res);
    }
  });

  app.post("/api/song-shares/:shareId/open", ...guard, async (req, res) => {
    try {
      const share = await openSongShare(userId(req), Number(req.params.shareId));
      res.json({ share });
    } catch (err) {
      handleSongShareError(err, res);
    }
  });

  app.post("/api/song-shares/:shareId/accept", ...guard, async (req, res) => {
    try {
      const result = await acceptSongShare(userId(req), Number(req.params.shareId));
      res.json(result);
    } catch (err) {
      handleSongShareError(err, res);
    }
  });

  app.post("/api/song-shares/:shareId/discard", ...guard, async (req, res) => {
    try {
      await discardSongShare(userId(req), Number(req.params.shareId));
      res.json({ ok: true });
    } catch (err) {
      handleSongShareError(err, res);
    }
  });

  app.post("/api/song-shares/:shareId/respond", ...guard, async (req, res) => {
    try {
      const { message } = req.body as { message?: string };
      await respondToSongShare(
        userId(req),
        Number(req.params.shareId),
        message ?? ""
      );
      res.json({ ok: true });
    } catch (err) {
      handleSongShareError(err, res);
    }
  });

  app.post("/api/song-shares/:shareId/sender-ack", ...guard, async (req, res) => {
    try {
      await ackSenderReply(userId(req), Number(req.params.shareId));
      res.json({ ok: true });
    } catch (err) {
      handleSongShareError(err, res);
    }
  });
}
