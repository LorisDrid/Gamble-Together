import { test, expect, type Page } from "@playwright/test";

/**
 * Two players play a whole Liar's Dice game over real sockets. We drive it with a
 * trivial, always-legal, always-terminating strategy: on your turn, challenge if
 * there's a standing bid, otherwise open with the minimum bid; advance each
 * reveal. The deal is random, so we assert that *someone wins* — not who.
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

test("two players play a Liar's Dice game to a winner", async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const [host, bob] = await Promise.all(contexts.map((c) => c.newPage()));

  const code = await createTable(host, "Alice");
  await joinTable(bob, "Bob", code);

  await expect(host.locator(".guest-list li")).toHaveCount(2);
  await host
    .locator(".game-card", { hasText: "Liar's Dice" })
    .getByRole("button", { name: "Lancer" })
    .click();

  for (const page of [host, bob]) {
    await expect(page.getByTestId("liars-table")).toBeVisible();
  }

  const pages = [host, bob];
  for (let i = 0; i < 300; i++) {
    if ((await host.locator(".ld-winner").count()) > 0) break;

    // Advance a reveal (one click is enough — it flips the phase for everyone).
    let advanced = false;
    for (const page of pages) {
      const next = page.getByTestId("next-round-btn");
      if ((await next.count()) > 0 && (await next.isVisible().catch(() => false))) {
        await next.click().catch(() => {});
        advanced = true;
        break;
      }
    }
    if (!advanced) {
      for (const page of pages) {
        const challenge = page.getByTestId("challenge-btn");
        if ((await challenge.count()) === 0) continue; // not this player's turn
        if (await challenge.isEnabled()) await challenge.click().catch(() => {});
        else await page.getByTestId("bid-submit").click().catch(() => {});
      }
    }
    await host.waitForTimeout(50);
  }

  await expect(host.locator(".ld-winner")).toBeVisible();
  await Promise.all(contexts.map((c) => c.close()));
});
