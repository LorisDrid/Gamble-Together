import { test, expect } from "@playwright/test";

test("creating a table sends the host to a lobby with a 4-letter code", async ({ page }) => {
  await page.goto("/");
  await page.fill("#nickname", "Alice");
  await page.getByRole("button", { name: "Créer une table" }).click();

  await expect(page).toHaveURL(/\/table\/[A-Z0-9]{4}$/);
  // The lobby shows the shareable room code as four tiles.
  await expect(page.locator(".code-tiles span")).toHaveCount(4);
  await expect(page.getByText("Choisis un jeu")).toBeVisible();
});
