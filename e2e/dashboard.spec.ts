import { expect, test } from "playwright/test";

test("processes transcript input without browser runtime errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("getServerSnapshot")) {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.route("**/api/process", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        inputMode: "text",
        transcript: "Please send the weekly update to the team. Schedule QA sync tomorrow morning.",
        summary: "Please send the weekly update to the team. Schedule QA sync tomorrow morning.",
        actions: {
          taskList: [
            "send the weekly update to the team.",
            "Schedule QA sync tomorrow morning."
          ],
          emailDraft: "Subject: Transcript Follow-up\n\nHere is the weekly update..."
        },
        intelligence: {
          urgency: "low",
          sentiment: "neutral",
          openLoops: [],
          topics: [],
          entities: []
        },
        auditTrail: [
          { step: "capture", timestamp: new Date().toISOString(), details: "Input captured" }
        ],
        meta: {
          requestId: "mock-id",
          model: "mock-model",
          latencyMs: 100,
          validation: "passed",
          fallbackUsed: false,
          approvalRequired: false
        }
      })
    });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Action Center" })).toBeVisible();
  await page
    .getByPlaceholder("Manual override or post-capture edits...")
    .fill("Please send the weekly update to the team. Schedule QA sync tomorrow morning.");
  await page.getByRole("button", { name: "Analyze Input" }).click();

  await expect(page.getByRole("heading", { name: "Executive Summary" })).toBeVisible();
  await expect(
    page.getByText("Please send the weekly update to the team. Schedule QA sync tomorrow morning.").first(),
  ).toBeVisible();
  await expect(page.getByText("Operational Tasks")).toBeVisible();
  await expect(page.getByText("send the weekly update to the team.", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Schedule QA sync tomorrow morning.", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Proposed Correspondence")).toBeVisible();
  await expect(page.getByText("Subject: Transcript Follow-up").first()).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("opens configuration dialog and navigates core views", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Agent Settings" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Agent Configuration" })).toBeVisible();
  await dialog.getByRole("textbox").fill("playwright-workspace");
  await dialog.getByRole("button", { name: "Save Configuration" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("link", { name: "History" }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByRole("heading", { name: "Intelligence History" })).toBeVisible();
  await expect(page.getByPlaceholder("Search summaries or session IDs...")).toBeVisible();

  await page.getByRole("link", { name: "Status" }).click();
  await expect(page).toHaveURL(/\/status$/);
  await expect(page.getByRole("heading", { name: "System Vitality" })).toBeVisible();
});
