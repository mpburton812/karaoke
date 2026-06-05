/** Client auth API — must export changeUsername exactly once (see scripts/dedupe-auth-export.mjs). */
import { expireSession, shouldExpireSession } from "./session";

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

function apiUrl(path: string): string {
  if (API_BASE) return `${API_BASE}${path}`;
  return path;
}

export interface AuthUser {
  id: number;
  username: string;
  accessLevel?: "user" | "admin";
}

export interface ImpersonationInfo {
  active: boolean;
  impersonatorUsername: string;
}

export interface CurrentUserResponse {
  user: AuthUser;
  impersonation: ImpersonationInfo | null;
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

export async function fetchCurrentUser(): Promise<CurrentUserResponse> {
  const token = getStoredToken();
  if (!token) {
    throw new Error("Not authenticated. Please log in again.");
  }

  const res = await fetch(apiUrl("/api/auth/me"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  if (!res.ok) {
    const message = body.error || "Failed to load current user.";
    if (shouldExpireSession(res.status, message)) {
      expireSession();
    }
    throw new Error(message);
  }
  const impersonation =
    body.impersonation?.active === true
      ? {
          active: true as const,
          impersonatorUsername: String(
            body.impersonation.impersonatorUsername ?? "Admin"
          ),
        }
      : null;
  return {
    user: body.user as AuthUser,
    impersonation,
  };
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

export async function changeUsername(
  currentPassword: string,
  newUsername: string
): Promise<{ user: AuthUser; token: string }> {
  const token = getStoredToken();
  if (!token) {
    throw new Error("Not authenticated. Please log in again.");
  }

  const res = await fetch(apiUrl("/api/auth/change-username"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ currentPassword, newUsername }),
  });
  const body = await res.json();
  if (!res.ok) {
    const message = body.error || "Username change failed.";
    if (shouldExpireSession(res.status, message)) {
      expireSession();
    }
    throw new Error(message);
  }
  return body;
}
