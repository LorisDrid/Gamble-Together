import { expect, test } from "@playwright/test";

test("the host sends the whole table back to the lobby to pick another game", async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  try {
    const [host, guest] = await Promise.all(contexts.map((context) => context.newPage()));
    await host!.goto("/");
    await host!.fill("#nickname", "Alice");
    await host!.getByRole("button", { name: "Créer une table" }).click();
    await expect(host!).toHaveURL(/\/table\/[A-Z0-9]{4}$/);
    const code = host!.url().split("/table/")[1]!;

    await guest!.goto("/");
    await guest!.fill("#nickname", "Bob");
    await guest!.fill("#code", code);
    await guest!.getByRole("button", { name: "Rejoindre" }).click();
    await expect(host!.locator(".guest-list li")).toHaveCount(2);

    await host!.locator(".game-card", { hasText: "Blackjack" }).getByRole("button", { name: "Lancer" }).click();
    await expect(guest!.getByText("Place ta mise")).toBeVisible();

    // Host only
    await expect(guest!.getByRole("button", { name: "Retour au lobby" })).toHaveCount(0);

    // One click only arms it: the game goes on
    await host!.getByRole("button", { name: "Retour au lobby" }).click();
    await expect(host!.getByText("Place ta mise")).toBeVisible();

    await host!.getByRole("button", { name: /^Confirmer/ }).click();
    await expect(host!.locator(".guest-list li")).toHaveCount(2);
    await expect(guest!.getByText("En attente que l’hôte lance un jeu…")).toBeVisible();

    // Same table, another game
    await host!.locator(".game-card", { hasText: "Roulette" }).getByRole("button", { name: "Lancer" }).click();
    await expect(guest!.locator(".roulette-stage")).toBeVisible();
    await expect(host!).toHaveURL(new RegExp(`/table/${code}$`));
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test("an armed button disarms itself after a few seconds", async ({ page }) => {
  await page.goto("/");
  await page.fill("#nickname", "Bond");
  await page.getByRole("button", { name: "Créer une table" }).click();
  await expect(page).toHaveURL(/\/table\/[A-Z0-9]{4}$/);
  await page.locator(".game-card", { hasText: "Blackjack" }).getByRole("button", { name: "Lancer" }).click();

  await page.getByRole("button", { name: "Retour au lobby" }).click();
  await expect(page.getByRole("button", { name: /^Confirmer/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retour au lobby" })).toBeVisible({ timeout: 6000 });
  await expect(page.getByText("Place ta mise")).toBeVisible();
});
