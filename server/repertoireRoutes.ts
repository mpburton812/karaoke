import type { Express, Request, Response, NextFunction } from "express";
import {
  RepertoireError,
  addLocationTag,
  addSongTag,
  assertPortabilityTable,
  createLocation,
  createPerformance,
  createTag,
  deleteLocation,
  deletePerformance,
  deleteSong,
  deleteTag,
  exportPortabilityTable,
  findDuplicateSong,
  getLocationStats,
  getPerformanceTagIds,
  getSong,
  getStatsDashboard,
  importPortabilityRows,
  listAllPerformances,
  listLocationPerformances,
  listLocationTags,
  listLocations,
  listPerformances,
  listSongTags,
  listSongs,
  listSongsByRating,
  listTags,
  listTagsSimple,
  patchSong,
  removeLocationTag,
  removeSongTag,
  searchSongsByTags,
  updatePerformance,
  upsertSong,
  wipeUserRepertoire,
} from "./repertoire.js";

type AuthedRequest = Request & { userId: number };

function userId(req: Request): number {
  return (req as AuthedRequest).userId;
}

function handleRepertoireError(err: unknown, res: Response): void {
  if (err instanceof RepertoireError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : "Request failed.";
  res.status(500).json({ error: message });
}

export function registerRepertoireRoutes(
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

  app.get("/api/songs", ...guard, async (req, res) => {
    try {
      const songs = await listSongs(userId(req));
      res.json({ songs });
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });

  app.get("/api/songs/:songId", ...guard, async (req, res) => {
    try {
      const songId = Number(req.params.songId);
      const song = await getSong(userId(req), songId);
      if (!song) {
        res.status(404).json({ error: "Song not found." });
        return;
      }
      res.json({ song });
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });

  app.post("/api/songs/check-duplicate", ...guard, async (req, res) => {
    try {
      const { itunesId, trackName, artistName } = req.body as {
        itunesId?: number | string;
        trackName?: string;
        artistName?: string;
      };
      if (itunesId == null || !trackName || !artistName) {
        res.status(400).json({ error: "itunesId, trackName, and artistName are required." });
        return;
      }
      const existing = await findDuplicateSong(userId(req), {
        itunesId,
        trackName,
        artistName,
      });
      res.json({ existing });
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });

  app.post("/api/songs", ...guard, async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const result = await upsertSong(userId(req), {
        itunesId: body.itunesId as number | string,
        trackName: String(body.trackName ?? ""),
        artistName: String(body.artistName ?? ""),
        artworkUrl: String(body.artworkUrl ?? ""),
        durationMs: Number(body.durationMs ?? 0),
        releaseDate: String(body.releaseDate ?? ""),
        explicit: Number(body.explicit ?? 0),
        album: String(body.album ?? ""),
        releaseYear: Number(body.releaseYear ?? 0),
        lyrics: (body.lyrics as string | null) ?? null,
      });
      res.status(201).json(result);
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });

  app.patch("/api/songs/:songId", ...guard, async (req, res) => {
    try {
      const songId = Number(req.params.songId);
      const { personal_key, vocal_status, lyrics } = req.body as {
        personal_key?: string;
        vocal_status?: string;
        lyrics?: string | null;
      };
      const patch: Record<string, string | null> = {};
      if (personal_key !== undefined) patch.personal_key = personal_key;
      if (vocal_status !== undefined) patch.vocal_status = vocal_status;
      if (lyrics !== undefined) patch.lyrics = lyrics;
      if (Object.keys(patch).length === 0) {
        res.status(400).json({ error: "No fields to update." });
        return;
      }
      await patchSong(userId(req), songId, patch);
      res.json({ ok: true });
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });

  app.delete("/api/songs/:songId", ...guard, async (req, res) => {
    try {
      await deleteSong(userId(req), Number(req.params.songId));
      res.json({ ok: true });
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });

  app.get("/api/songs/:songId/tags", ...guard, async (req, res) => {
    try {
      const tags = await listSongTags(userId(req), Number(req.params.songId));
      res.json({ tags });
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });

  app.post("/api/songs/:songId/tags", ...guard, async (req, res) => {
    try {
      const { tagId } = req.body as { tagId?: number };
      if (tagId == null) {
        res.status(400).json({ error: "tagId is required." });
        return;
      }
      await addSongTag(userId(req), Number(req.params.songId), tagId);
      res.json({ ok: true });
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });

  app.delete("/api/songs/:songId/tags/:tagId", ...guard, async (req, res) => {
    try {
      await removeSongTag(
        userId(req),
        Number(req.params.songId),
        Number(req.params.tagId)
      );
      res.json({ ok: true });
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });

  app.get("/api/songs/:songId/performances", ...guard, async (req, res) => {
    try {
      const performances = await listPerformances(
        userId(req),
        Number(req.params.songId)
      );
      res.json({ performances });
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });

  app.post("/api/songs/:songId/performances", ...guard, async (req, res) => {
    try {
      const { date, location, notes, rating, tagIds } = req.body as {
        date?: string;
        location?: string;
        notes?: string;
        rating?: number;
        tagIds?: number[];
      };
      const result = await createPerformance(
        userId(req),
        Number(req.params.songId),
        {
          date: date ?? "",
          location: location ?? "",
          notes: notes ?? "",
          rating: rating ?? 3,
          tagIds,
        }
      );
      res.status(201).json(result);
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });

  app.get("/api/performances/:perfId/tag-ids", ...guard, async (req, res) => {
    try {
      const tagIds = await getPerformanceTagIds(
        userId(req),
        Number(req.params.perfId)
      );
      res.json({ tagIds });
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });

  app.patch("/api/performances/:perfId", ...guard, async (req, res) => {
    try {
      const { date, location, notes, rating, tagIds } = req.body as {
        date?: string;
        location?: string;
        notes?: string;
        rating?: number;
        tagIds?: number[];
      };
      await updatePerformance(userId(req), Number(req.params.perfId), {
        date: date ?? "",
        location: location ?? "",
        notes: notes ?? "",
        rating: rating ?? 3,
        tagIds,
      });
      res.json({ ok: true });
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });

  app.delete("/api/performances/:perfId", ...guard, async (req, res) => {
    try {
      await deletePerformance(userId(req), Number(req.params.perfId));
      res.json({ ok: true });
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });

  app.get("/api/tags", ...guard, async (req, res) => {
    try {
      const withCounts = req.query.counts === "1";
      const tags = withCounts
        ? await listTags(userId(req))
        : await listTagsSimple(userId(req));
      res.json({ tags });
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });

  app.get("/api/tags/songs", ...guard, async (req, res) => {
    try {
      const raw = String(req.query.tagIds ?? "");
      const tagIds = raw
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
      const logic = req.query.logic === "OR" ? "OR" : "AND";
      const songs = await searchSongsByTags(userId(req), tagIds, logic);
      res.json({ songs });
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });

  app.post("/api/tags", ...guard, async (req, res) => {
    try {
      const { name } = req.body as { name?: string };
      if (!name?.trim()) {
        res.status(400).json({ error: "name is required." });
        return;
      }
      await createTag(userId(req), name);
      res.status(201).json({ ok: true });
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });

  app.delete("/api/tags/:tagId", ...guard, async (req, res) => {
    try {
      await deleteTag(userId(req), Number(req.params.tagId));
      res.json({ ok: true });
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });

  app.get("/api/locations", ...guard, async (req, res) => {
    try {
      const withTagIds = req.query.withTagIds === "1";
      const locations = await listLocations(userId(req), { withTagIds });
      res.json({ locations });
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });

  app.post("/api/locations", ...guard, async (req, res) => {
    try {
      const { name } = req.body as { name?: string };
      if (!name?.trim()) {
        res.status(400).json({ error: "name is required." });
        return;
      }
      await createLocation(userId(req), name);
      res.status(201).json({ ok: true });
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });

  app.delete("/api/locations/:locationId", ...guard, async (req, res) => {
    try {
      await deleteLocation(userId(req), Number(req.params.locationId));
      res.json({ ok: true });
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });

  app.get("/api/locations/:locationId/tags", ...guard, async (req, res) => {
    try {
      const tags = await listLocationTags(
        userId(req),
        Number(req.params.locationId)
      );
      res.json({ tags });
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });

  app.post("/api/locations/:locationId/tags", ...guard, async (req, res) => {
    try {
      const { tagId } = req.body as { tagId?: number };
      if (tagId == null) {
        res.status(400).json({ error: "tagId is required." });
        return;
      }
      await addLocationTag(
        userId(req),
        Number(req.params.locationId),
        tagId
      );
      res.json({ ok: true });
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });

  app.delete(
    "/api/locations/:locationId/tags/:tagId",
    ...guard,
    async (req, res) => {
      try {
        await removeLocationTag(
          userId(req),
          Number(req.params.locationId),
          Number(req.params.tagId)
        );
        res.json({ ok: true });
      } catch (err) {
        handleRepertoireError(err, res);
      }
    }
  );

  app.get("/api/locations/:locationId/stats", ...guard, async (req, res) => {
    try {
      const locationName = String(req.query.name ?? "");
      if (!locationName) {
        res.status(400).json({ error: "name query parameter is required." });
        return;
      }
      const stats = await getLocationStats(userId(req), locationName);
      res.json(stats);
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });

  app.get(
    "/api/locations/performances",
    ...guard,
    async (req, res) => {
      try {
        const name = String(req.query.name ?? "");
        if (!name) {
          res.status(400).json({ error: "name query parameter is required." });
          return;
        }
        const rows = await listLocationPerformances(userId(req), name);
        res.json({ performances: rows });
      } catch (err) {
        handleRepertoireError(err, res);
      }
    }
  );

  app.get("/api/stats/dashboard", ...guard, async (req, res) => {
    try {
      const dashboard = await getStatsDashboard(userId(req));
      res.json(dashboard);
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });

  app.get("/api/stats/performances", ...guard, async (req, res) => {
    try {
      const performances = await listAllPerformances(userId(req));
      res.json({ performances });
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });

  app.get("/api/stats/songs-by-rating", ...guard, async (req, res) => {
    try {
      const songs = await listSongsByRating(userId(req));
      res.json({ songs });
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });

  app.get("/api/portability/:table", ...guard, async (req, res) => {
    try {
      const table = assertPortabilityTable(req.params.table);
      const rows = await exportPortabilityTable(userId(req), table);
      res.json({ rows });
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });

  app.post("/api/portability/:table", ...guard, async (req, res) => {
    try {
      const table = assertPortabilityTable(req.params.table);
      const { rows } = req.body as { rows?: Record<string, unknown>[] };
      if (!Array.isArray(rows)) {
        res.status(400).json({ error: "rows array is required." });
        return;
      }
      const count = await importPortabilityRows(userId(req), table, rows);
      res.json({ imported: count });
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });

  app.post("/api/account/wipe", ...guard, async (req, res) => {
    try {
      await wipeUserRepertoire(userId(req));
      res.json({ ok: true });
    } catch (err) {
      handleRepertoireError(err, res);
    }
  });
}
