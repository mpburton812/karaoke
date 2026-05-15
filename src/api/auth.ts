import { expireSession, shouldExpireSession } from "./session";

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

function apiUrl(path: string): string {
  if (API_BASE) return `${API_BASE}${path}`;
  return path;
}

export interface AuthUser {
  id: number;
  username: string;
}

export async function register(
  username: string,
  password: string
): Promise<{ user: AuthUser; token: string }> {
  const res = await fetch(apiUrl("/api/auth/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || "Registration failed.");
  }
  return body;
}

export async function login(
  username: string,
  password: string
): Promise<{ user: AuthUser; token: string }> {
  const res = await fetch(apiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || "Login failed.");
  }
  return body;
}

export function persistSession(user: AuthUser, token: string): void {
  localStorage.setItem("karaoke_user", JSON.stringify(user));
  localStorage.setItem("karaoke_token", token);
}

export function clearSession(): void {
  localStorage.removeItem("karaoke_user");
  localStorage.removeItem("karaoke_token");
}

export function getStoredToken(): string | null {
  return localStorage.getItem("karaoke_token");
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ user: AuthUser; token: string }> {
  const token = getStoredToken();
  if (!token) {
    throw new Error("Not authenticated. Please log in again.");
  }

  const res = await fetch(apiUrl("/api/auth/change-password"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const body = await res.json();
  if (!res.ok) {
    const message = body.error || "Password change failed.";
    if (shouldExpireSession(res.status, message)) {
      expireSession();
    }
    throw new Error(message);
  }
  return body;
}
