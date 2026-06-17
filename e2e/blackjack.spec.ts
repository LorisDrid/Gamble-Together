import { test, expect } from "@playwright/test";

/**
 * Blackjack is a solo-vs-dealer game, so one player covers the whole flow: stack
 * a chip, commit the bet, stand, and the dealer plays out to a verdict. The deal
 * is random, so we assert a verdict *appears* — not win vs lose.
 */
test("plays a blackjack round end to end", async ({ page }) => {
  await page.goto("/");
  await page.fill("#nickname", "Bond");
  await page.getByRole("button", { name: "Créer une table" }).click();
  await expect(page).toHaveURL(/\/table\/[A-Z0-9]{4}$/);

  // Launch Blackjack from the lobby.
  await page
    .locator(".game-card", { hasText: "Blackjack" })
    .getByRole("button", { name: "Lancer" })
    .click();
  await expect(page.getByText("Place ta mise")).toBeVisible();

  // Stack a 100 chip and commit the bet.
  await page.locator(".chip-btn", { hasText: "100" }).click();
  await page.getByRole("button", { name: /^Miser/ }).click();

  // The hand is dealt; stand (unless a dealt natural already settled the round).
  await page
    .getByRole("button", { name: "Rester" })
    .click({ timeout: 8000 })
    .catch(() => {});

  // The dealer plays out and a verdict is shown.
  await expect(page.locator(".verdict").first()).toBeVisible({ timeout: 12000 });
});
