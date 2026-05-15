import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_EXPIRED_MESSAGE,
  expireSession,
  setSessionExpiredHandler,
  shouldExpireSession,
} from "./session";

vi.mock("./auth", () => ({
  clearSession: vi.fn(),
}));

import { clearSession } from "./auth";

describe("session", () => {
  beforeEach(() => {
    vi.mocked(clearSession).mockClear();
    setSessionExpiredHandler(null);
  });

  it("detects expired session errors", () => {
    expect(shouldExpireSession(401, "Invalid or expired session.")).toBe(true);
    expect(shouldExpireSession(401, "Authentication required.")).toBe(true);
  });

  it("does not treat login failure as session expiry", () => {
    expect(shouldExpireSession(401, "Invalid username or password.")).toBe(false);
    expect(shouldExpireSession(401, "Current password is incorrect.")).toBe(false);
  });

  it("expireSession clears storage and notifies handler", () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);

    expect(() => expireSession()).toThrow(SESSION_EXPIRED_MESSAGE);
    expect(clearSession).toHaveBeenCalled();
    expect(handler).toHaveBeenCalledWith(SESSION_EXPIRED_MESSAGE);
  });
});
