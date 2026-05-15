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

export function createApp() {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "2mb" }));

  app.get("/", (_req, res) => {
    res.json({
      name: "Karaoke Companion API",
      status: "running",
      health: "/api/health",
      auth: ["/api/auth/register", "/api/auth/login", "/api/auth/change-password"],
      data: ["/api/execute", "/api/batch"],
      note: "Use the web app at http://localhost:5173 — not this URL directly.",
    });
  });

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
