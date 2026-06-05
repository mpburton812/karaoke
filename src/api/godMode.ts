import {
  getStoredToken,
  persistSession,
  type AuthUser,
  type ImpersonationInfo,
} from "./auth";

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

function apiUrl(path: string): string {
  if (API_BASE) return `${API_BASE}${path}`;
  return path;
}

async function godFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
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

export interface GodModeUser {
  id: number;
  username: string;
  accessLevel: "user" | "admin";
  lastLoginAt: string | null;
  /** Latest performance date (YYYY-MM-DD); independent of password sign-in. */
  lastPerformanceAt: string | null;
  songCount: number;
  tagCount: number;
  venueCount: number;
}

export interface GodModePerformance {
  id: number;
  date: string | null;
  time: string | null;
  location: string | null;
  rating: number;
  notes: string | null;
  trackName: string | null;
  artistName: string | null;
}

export async function fetchGodModeUsers(): Promise<GodModeUser[]> {
  const body = await godFetch<{ users?: GodModeUser[] }>("/api/admin/users");
  return Array.isArray(body.users) ? body.users : [];
}

export async function changeGodModeUserPassword(
  userId: number,
  newPassword: string
): Promise<void> {
  await godFetch(`/api/admin/users/${userId}/password`, {
    method: "POST",
    body: JSON.stringify({ newPassword }),
  });
}

export async function deleteGodModeUser(userId: number): Promise<void> {
  await godFetch(`/api/admin/users/${userId}`, { method: "DELETE" });
}

export async function fetchGodModePerformances(
  userId: number
): Promise<GodModePerformance[]> {
  const body = await godFetch<{ performances?: GodModePerformance[] }>(
    `/api/admin/users/${userId}/performances`
  );
  return Array.isArray(body.performances) ? body.performances : [];
}

export async function impersonateGodModeUser(userId: number): Promise<{
  user: AuthUser;
  token: string;
  impersonation: ImpersonationInfo;
}> {
  const body = await godFetch<{
    user: AuthUser;
    token: string;
    impersonation: ImpersonationInfo;
  }>(`/api/admin/users/${userId}/impersonate`, { method: "POST" });
  persistSession(body.user, body.token);
  return body;
}

export async function exitGodModeImpersonation(): Promise<{
  user: AuthUser;
  token: string;
}> {
  const body = await godFetch<{
    user: AuthUser;
    token: string;
    impersonation: null;
  }>("/api/admin/impersonate/exit", { method: "POST" });
  persistSession(body.user, body.token);
  return body;
}
