import { beforeEach, describe, expect, it } from "vitest";
import {
  isWelcomeDismissed,
  setWelcomeDismissed,
} from "./welcomeMessage";

describe("welcomeMessage storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts not dismissed for a user", () => {
    expect(isWelcomeDismissed(42)).toBe(false);
  });

  it("remembers dismiss per user id", () => {
    setWelcomeDismissed(1);
    expect(isWelcomeDismissed(1)).toBe(true);
    expect(isWelcomeDismissed(2)).toBe(false);
  });
});
