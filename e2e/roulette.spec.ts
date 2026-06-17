import { test, expect } from "@playwright/test";

/**
 * Roulette is a bet-vs-house game, so one player covers the whole flow: launch
 * it, drop a chip on a mat cell, validate, and the wheel spins to a result. The
 * spin is random, so we assert the result *appears* — not which number.
 */
test("plays a roulette round end to end", async ({ page }) => {
  await page.goto("/");
  await page.fill("#nickname", "Bond");
  await page.getByRole("button", { name: "Créer une table" }).click();
  await expect(page).toHaveURL(/\/table\/[A-Z0-9]{4}$/);

  // Launch Roulette from the lobby.
  await page
    .locator(".game-card", { hasText: "Roulette" })
    .getByRole("button", { name: "Lancer" })
    .click();
  await expect(page.getByText("Place tes mises")).toBeVisible();

  // Pick the 100 chip, then drop it on the Rouge cell.
  await page.locator(".chip-btn", { hasText: "100" }).click();
  const rouge = page.locator(".rcell", { hasText: "Rouge" });
  await rouge.click();
  await expect(rouge.locator(".rstake")).toHaveText("100");

  // Validate → the wheel spins and lands on a number.
  await page.getByRole("button", { name: "Valider mes mises" }).click();

  // The spin takes ~2s; wait for the result and the "next round" control.
  await expect(page.getByRole("button", { name: "Tour suivant" })).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".roulette-number")).toBeVisible();
});
