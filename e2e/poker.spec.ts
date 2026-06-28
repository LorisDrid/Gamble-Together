import { test, expect, type Page } from "@playwright/test";

/**
 * Two players play a poker hand over real sockets. Heads-up, a single fold ends
 * the hand, so we drive it the simplest terminating way: whoever is to act folds.
 * We then assert the hand resolved (the "next hand" control reappears).
 */

async function createTable(page: Page, nickname: string): Promise<string> {
  await page.goto("/");
  await page.fill("#nickname", nickname);
  await page.getByRole("button", { name: "Créer une table" }).click();
  await expect(page).toHaveURL(/\/table\/[A-Z0-9]{4}$/);
  return page.url().split("/table/")[1]!;
}

async function joinTable(page: Page, nickname: string, code: string): Promise<void> {
  await page.goto("/");
  await page.fill("#nickname", nickname);
  await page.fill("#code", code);
  await page.getByRole("button", { name: "Rejoindre" }).click();
  await expect(page).toHaveURL(new RegExp(`/table/${code}$`));
}

test("two players play a poker hand to a result", async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const [host, bob] = await Promise.all(contexts.map((c) => c.newPage()));

  const code = await createTable(host, "Alice");
  await joinTable(bob, "Bob", code);

  await expect(host.locator(".guest-list li")).toHaveCount(2);
  await host
    .locator(".game-card", { hasText: "Poker" })
    .getByRole("button", { name: "Lancer" })
    .click();

  // The first hand is dealt automatically — wait for the table, then play.
  await expect(host.getByText("Pré-flop")).toBeVisible();

  // Whoever is to act folds → the hand ends.
  const pages = [host, bob];
  for (let i = 0; i < 20; i++) {
    if ((await host.getByRole("button", { name: "Main suivante" }).count()) > 0) break;
    for (const page of pages) {
      const fold = page.getByRole("button", { name: "Se coucher" });
      if ((await fold.count()) > 0 && (await fold.isVisible().catch(() => false))) {
        await fold.click().catch(() => {});
        break;
      }
    }
    await host.waitForTimeout(80);
  }

  // The hand resolved and the table offers the next one.
  await expect(host.getByRole("button", { name: "Main suivante" })).toBeVisible();
  await Promise.all(contexts.map((c) => c.close()));
});
