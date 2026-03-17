import { expect, test } from "playwright/test";

// Headless Chromium has webkitSpeechRecognition available (as a stub), so the
// "Start listening" button is enabled. However, no real microphone exists in CI
// / headless mode — clicking it will immediately fire an error event
// (not-allowed or audio-capture). The tests here validate observable UI
// behaviour under those conditions, not that voice capture works end-to-end.

test.describe("Voice / mic capture", () => {
  test("Start listening button is visible on the dashboard home page", async ({ page }) => {
    await page.goto("/");
    const startBtn = page.getByRole("button", { name: "Start listening" });
    await expect(startBtn).toBeVisible();
  });

  test("mic permission label is visible in the input section", async ({ page }) => {
    await page.goto("/");
    // The label "Mic: granted" (or similar) is rendered in the InputSection
    const micLabel = page.locator("text=Mic:");
    await expect(micLabel).toBeVisible();
  });

  test("no unhandled page crash on dashboard load (voice subsystem init)", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/");

    // Verify the main heading is present — page must have fully rendered
    await expect(page.getByRole("heading", { name: "Action Center" })).toBeVisible();

    // No uncaught JS exceptions should occur during voice subsystem initialisation
    expect(pageErrors).toEqual([]);
  });
});
