import { expect, test } from "@playwright/test";

test("a two-player tournament chains roulette into a whole Liar's Dice game", async ({ browser }) => {
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

    // Président needs 3 players: greyed out at a table of two
    const leg = (name: string) => host!.locator(".tourney-game", { hasText: name });
    await expect(leg("Président")).toBeDisabled();
    await expect(leg("Liar's Dice")).toBeEnabled();

    // Keep only Roulette → Liar's Dice, one round per stake leg
    await leg("Blackjack").click();
    await leg("Poker").click();
    await leg("Liar's Dice").click();
    await host!.fill("#rounds-per-leg", "1");
    await host!.getByRole("button", { name: "Lancer le tournoi (2 jeux)" }).click();

    // Leg 1: both players pass the roulette round
    for (const page of [host!, guest!]) {
      await expect(page.locator(".tb-now")).toContainText("1 manche");
      await page.getByRole("button", { name: "Passer ce tour" }).click();
    }

    // Intermission, then the Liar's Dice leg, played as one whole game
    await expect(guest!.locator(".tournament-intermission")).toBeVisible();
    await expect(guest!.getByTestId("liars-table")).toBeVisible({ timeout: 10_000 });
    await expect(guest!.locator(".tb-now")).toContainText("une partie");
    await expect(guest!.locator(".tb-leg.done")).toHaveText("Roulette");
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
