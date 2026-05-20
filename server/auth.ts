import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request } from "express";
import { db } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-insecure-change-me";
const TOKEN_TTL = "7d";

export interface AuthUser {
  id: number;
  username: string;
  accessLevel: "user" | "admin";
}

export interface JwtPayload {
  sub: number;
  username: string;
  accessLevel?: "user" | "admin";
}

export function signToken(user: AuthUser): string {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      accessLevel: user.accessLevel,
    } satisfies JwtPayload,
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

export async function registerUser(
  username: string,
  password: string
): Promise<AuthUser> {
  const trimmed = username.trim();
  if (!trimmed || password.length < 8) {
    throw new Error("Username required and password must be at least 8 characters.");
  }

  const existing = await db.execute({
    sql: "SELECT id FROM users WHERE LOWER(username) = LOWER(?)",
    args: [trimmed],
  });
  if (existing.rows.length > 0) {
    throw new Error("Username already exists.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const accessLevel = trimmed.toLowerCase() === "mpburton" ? "admin" : "user";
  const result = await db.execute({
    sql: "INSERT INTO users (username, password_hash, access_level) VALUES (?, ?, ?) RETURNING id, username, access_level",
    args: [trimmed, passwordHash, accessLevel],
  });
  const row = result.rows[0] as {
    id: number;
    username: string;
    access_level?: string;
  };
  await db.execute({
    sql: "UPDATE users SET last_login_at = datetime('now') WHERE id = ?",
    args: [row.id],
  });
  return {
    id: row.id,
    username: row.username,
    accessLevel: row.access_level === "admin" ? "admin" : "user",
  };
}

export async function loginUser(
  username: string,
  password: string
): Promise<AuthUser> {
  const trimmed = username.trim();
  const result = await db.execute({
    sql: "SELECT id, username, password_hash, access_level FROM users WHERE LOWER(username) = LOWER(?)",
    args: [trimmed],
  });

  if (result.rows.length === 0) {
    throw new Error("Invalid username or password.");
  }

  const row = result.rows[0] as {
    id: number;
    username: string;
    password_hash: string | null;
    access_level?: string | null;
  };

  if (!row.password_hash) {
    throw new Error(
      "This account has no password. Create a new account with a password."
    );
  }

  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) {
    throw new Error("Invalid username or password.");
  }

  await db.execute({
    sql: "UPDATE users SET last_login_at = datetime('now') WHERE id = ?",
    args: [row.id],
  });

  return {
    id: row.id,
    username: row.username,
    accessLevel: row.access_level === "admin" ? "admin" : "user",
  };
}

export async function changePassword(
  userId: number,
  currentPassword: string,
  newPassword: string
): Promise<AuthUser> {
  if (!currentPassword || newPassword.length < 8) {
    throw new Error("Current password required; new password must be at least 8 characters.");
  }

  const result = await db.execute({
    sql: "SELECT id, username, password_hash, access_level FROM users WHERE id = ?",
    args: [userId],
  });

  if (result.rows.length === 0) {
    throw new Error("User not found.");
  }

  const row = result.rows[0] as {
    id: number;
    username: string;
    password_hash: string | null;
    access_level?: string | null;
  };

  if (!row.password_hash) {
    throw new Error("This account has no password set.");
  }

  const valid = await bcrypt.compare(currentPassword, row.password_hash);
  if (!valid) {
    throw new Error("Current password is incorrect.");
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.execute({
    sql: "UPDATE users SET password_hash = ? WHERE id = ?",
    args: [passwordHash, userId],
  });

  return {
    id: row.id,
    username: row.username,
    accessLevel: row.access_level === "admin" ? "admin" : "user",
  };
}

export async function changeUsername(
  userId: number,
  currentPassword: string,
  newUsername: string
): Promise<AuthUser> {
  const trimmed = newUsername.trim();
  if (!trimmed) {
    throw new Error("Username is required.");
  }
  if (!currentPassword) {
    throw new Error("Current password is required.");
  }

  const result = await db.execute({
    sql: "SELECT id, username, password_hash, access_level FROM users WHERE id = ?",
    args: [userId],
  });

  if (result.rows.length === 0) {
    throw new Error("User not found.");
  }

  const row = result.rows[0] as {
    id: number;
    username: string;
    password_hash: string | null;
    access_level?: string | null;
  };

  if (!row.password_hash) {
    throw new Error("This account has no password set.");
  }

  const valid = await bcrypt.compare(currentPassword, row.password_hash);
  if (!valid) {
    throw new Error("Current password is incorrect.");
  }

  if (trimmed.toLowerCase() === row.username.toLowerCase()) {
    throw new Error("Choose a different username.");
  }

  const existing = await db.execute({
    sql: "SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?",
    args: [trimmed, userId],
  });
  if (existing.rows.length > 0) {
    throw new Error("Username already exists.");
  }

  await db.execute({
    sql: "UPDATE users SET username = ? WHERE id = ?",
    args: [trimmed, userId],
  });

  return {
    id: row.id,
    username: trimmed,
    accessLevel: row.access_level === "admin" ? "admin" : "user",
  };
}

export async function getAuthUserById(userId: number): Promise<AuthUser | null> {
  const result = await db.execute({
    sql: "SELECT id, username, access_level FROM users WHERE id = ?",
    args: [userId],
  });
  const row = result.rows[0] as
    | { id: number; username: string; access_level?: string | null }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    accessLevel: row.access_level === "admin" ? "admin" : "user",
  };
}

export async function userIsAdmin(userId: number): Promise<boolean> {
  const user = await getAuthUserById(userId);
  return user?.accessLevel === "admin";
}

export async function adminSetUserPassword(
  targetUserId: number,
  newPassword: string
): Promise<void> {
  if (newPassword.length < 8) {
    throw new Error("New password must be at least 8 characters.");
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  const result = await db.execute({
    sql: "UPDATE users SET password_hash = ? WHERE id = ?",
    args: [passwordHash, targetUserId],
  });
  if ((result.rowsAffected ?? 0) === 0) {
    throw new Error("User not found.");
  }
}
