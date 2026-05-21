import { test, expect } from "@playwright/test";

test.describe("bootstrap (no white screen)", () => {
  test("shows Karaoke Companion shell after load", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Karaoke Companion" })
    ).toBeVisible({ timeout: 30_000 });

    const root = page.locator("#root");
    await expect(root).not.toBeEmpty();

    const loginOrBoot = page.getByText(/log in to your account|connecting to server/i);
    await expect(loginOrBoot.first()).toBeVisible({ timeout: 15_000 });

    expect(
      pageErrors,
      `uncaught errors: ${pageErrors.join("; ")}`
    ).toEqual([]);
  });

  test("serves a fresh build stamp", async ({ request }) => {
    const res = await request.get("/build-stamp.json");
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { commit?: string };
    expect(body.commit).toBeTruthy();
  });
});
