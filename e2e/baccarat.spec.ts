import { test, expect } from "@playwright/test";

/**
 * Baccarat is a bet-vs-house game, so a single player exercises the whole flow:
 * launch it, stake a chip on a zone, validate, and a coup is dealt and resolved.
 * The deal is random (real shuffle), so we assert the result *appears* — not a
 * specific outcome (that's covered by the unit tests).
 */
test("plays a baccarat coup end to end", async ({ page }) => {
  await page.goto("/");
  await page.fill("#nickname", "Bond");
  await page.getByRole("button", { name: "Créer une table" }).click();
  await expect(page).toHaveURL(/\/table\/[A-Z0-9]{4}$/);

  // Launch Baccarat from the lobby.
  await page
    .locator(".game-card", { hasText: "Baccarat" })
    .getByRole("button", { name: "Lancer" })
    .click();
  await expect(page.getByText("Place tes mises")).toBeVisible();

  // Pick the 100 chip, then drop it on the Player zone.
  await page.locator(".chip-btn", { hasText: "100" }).click();
  await expect(page.locator(".chip-btn.selected")).toHaveText("100");
  const playerZone = page.locator(".bac-zone", { hasText: "Joueur" });
  await playerZone.click();
  await expect(playerZone.locator(".bac-stake")).toHaveText("100");

  // Validate → the coup is dealt and resolved.
  await page.getByRole("button", { name: "Valider mes mises" }).click();

  await expect(page.getByText("Tour terminé")).toBeVisible();
  await expect(page.locator(".bac-outcome")).toBeVisible();
  await expect(page.locator(".bac-hand")).toHaveCount(2); // both hands revealed
  await expect(page.getByRole("button", { name: "Tour suivant" })).toBeVisible();
});
