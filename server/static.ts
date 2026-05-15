import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Express, Request, Response, NextFunction } from "express";
import express from "express";

const distDir = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../dist"
);

/** Serve Vite production build and SPA fallback (API routes must be registered first). */
export function attachStaticFrontend(app: Express): void {
  app.use(express.static(distDir, { index: false }));

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    res.sendFile(path.join(distDir, "index.html"), (err) => {
      if (err) next(err);
    });
  });
}
