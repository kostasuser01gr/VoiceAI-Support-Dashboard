import { expect, test } from "playwright/test";

test.describe("Primary navigation", () => {
  test("dashboard link navigates to home and shows Action Center heading", async ({ page }) => {
    await page.goto("/history");
    await page.getByRole("link", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Action Center" })).toBeVisible();
  });

  test("history link navigates to /history and shows Intelligence History heading", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "History" }).first().click();
    await expect(page).toHaveURL(/\/history$/);
    await expect(page.getByRole("heading", { name: "Intelligence History" })).toBeVisible();
    await expect(page.getByPlaceholder("Search summaries or session IDs...")).toBeVisible();
  });

  test("actions link navigates to /actions and shows Action Board heading", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Actions" }).first().click();
    await expect(page).toHaveURL(/\/actions$/);
    await expect(page.getByRole("heading", { name: "Action Board" })).toBeVisible();
  });

  test("status link navigates to /status and shows System Vitality heading", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Status" }).first().click();
    await expect(page).toHaveURL(/\/status$/);
    await expect(page.getByRole("heading", { name: "System Vitality" })).toBeVisible();
  });

  test("integrations link navigates to /integrations and shows External Pipelines heading", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Integrations" }).first().click();
    await expect(page).toHaveURL(/\/integrations$/);
    await expect(page.getByRole("heading", { name: "External Pipelines" })).toBeVisible();
  });

  test("settings link navigates to /settings and shows Settings heading", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Settings" }).first().click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  });

  test("health API endpoint responds with status ok", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    const body = await response.json() as { status?: string };
    expect(body.status).toBe("ok");
  });
});
