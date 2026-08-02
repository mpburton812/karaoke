import { getStoredToken } from "./auth";

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

function apiUrl(path: string): string {
  if (API_BASE) return `${API_BASE}${path}`;
  return path;
}

async function motdFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const res = await fetch(apiUrl(path), { ...init, headers, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof body.error === "string" ? body.error : `Request failed (${res.status})`
    );
  }
  return body as T;
}

export interface AdminMotd {
  id: number;
  body: string;
  expiresAt: string;
  createdAt: string;
  createdBy: number | null;
  clearedAt: string | null;
  seenCount: number;
}

export interface UserMotd {
  id: number;
  body: string;
  expiresAt: string;
}

export async function fetchAdminMotd(): Promise<AdminMotd | null> {
  const body = await motdFetch<{ motd: AdminMotd | null }>("/api/admin/motd");
  return body.motd ?? null;
}

export async function publishAdminMotd(
  message: string,
  expiresAt?: string | null
): Promise<AdminMotd> {
  const body = await motdFetch<{ motd: AdminMotd }>("/api/admin/motd", {
    method: "PUT",
    body: JSON.stringify({
      message,
      expiresAt: expiresAt?.trim() ? expiresAt.trim() : null,
    }),
  });
  return body.motd;
}

export async function expireAdminMotdNow(): Promise<{ cleared: boolean }> {
  return motdFetch<{ ok: boolean; cleared: boolean }>("/api/admin/motd/expire", {
    method: "POST",
  });
}

export async function fetchUserMotd(): Promise<UserMotd | null> {
  const body = await motdFetch<{ motd: UserMotd | null }>("/api/motd");
  return body.motd ?? null;
}

export async function ackUserMotd(motdId: number): Promise<void> {
  await motdFetch("/api/motd/ack", {
    method: "POST",
    body: JSON.stringify({ motdId }),
  });
}
