import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request } from "express";
import { db } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-insecure-change-me";
const TOKEN_TTL = "7d";

export interface AuthUser {
  id: number;
  username: string;
}

export interface JwtPayload {
  sub: number;
  username: string;
}

export function signToken(user: AuthUser): string {
  return jwt.sign(
    { sub: user.id, username: user.username } satisfies JwtPayload,
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
  const result = await db.execute({
    sql: "INSERT INTO users (username, password_hash) VALUES (?, ?) RETURNING id, username",
    args: [trimmed, passwordHash],
  });
  const row = result.rows[0] as { id: number; username: string };
  return { id: row.id, username: row.username };
}

export async function loginUser(
  username: string,
  password: string
): Promise<AuthUser> {
  const trimmed = username.trim();
  const result = await db.execute({
    sql: "SELECT id, username, password_hash FROM users WHERE LOWER(username) = LOWER(?)",
    args: [trimmed],
  });

  if (result.rows.length === 0) {
    throw new Error("Invalid username or password.");
  }

  const row = result.rows[0] as {
    id: number;
    username: string;
    password_hash: string | null;
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

  return { id: row.id, username: row.username };
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
    sql: "SELECT id, username, password_hash FROM users WHERE id = ?",
    args: [userId],
  });

  if (result.rows.length === 0) {
    throw new Error("User not found.");
  }

  const row = result.rows[0] as {
    id: number;
    username: string;
    password_hash: string | null;
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

  return { id: row.id, username: row.username };
}
