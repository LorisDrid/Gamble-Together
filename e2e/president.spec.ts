import { test, expect, type Page } from "@playwright/test";

/**
 * Full multiplayer journey: three independent browser contexts (= three players)
 * create/join a room and play a whole Président round end to end, over real
 * sockets. The round is driven with a trivial-but-always-legal strategy — pass
 * when following, lay a single card when leading — so it completes whatever the
 * (random) deal is, and we assert the finishing ranks appear.
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

/** If it's this player's turn, make a legal move: pass when following, else lead a single. */
async function actIfMyTurn(page: Page): Promise<void> {
  const pass = page.getByTestId("pass-btn");
  if ((await pass.count()) === 0) return; // action bar absent → not our turn
  if (await pass.isEnabled()) {
    await pass.click();
  } else {
    await page.getByTestId("hand-card").first().click();
    await page.getByTestId("play-btn").click();
  }
}

test("three players play a full Président round to a finish", async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const [host, bob, cara] = await Promise.all(contexts.map((c) => c.newPage()));

  const code = await createTable(host, "Alice");
  await joinTable(bob, "Bob", code);
  await joinTable(cara, "Cara", code);

  // Host waits for all three seats, then launches Président.
  await expect(host.locator(".guest-list li")).toHaveCount(3);
  await host
    .locator(".game-card", { hasText: "Président" })
    .getByRole("button", { name: "Lancer" })
    .click();

  // Everyone lands on the Président table.
  for (const page of [host, bob, cara]) {
    await expect(page.getByTestId("president-table")).toBeVisible();
  }

  // Drive the round until it's done.
  const pages = [host, bob, cara];
  for (let i = 0; i < 400; i++) {
    if ((await host.getByTestId("next-round-btn").count()) > 0) break;
    for (const page of pages) await actIfMyTurn(page).catch(() => {});
    await host.waitForTimeout(50);
  }

  // The round finished: ranking shown and the next round can start.
  await expect(host.getByTestId("next-round-btn")).toBeVisible();
  await expect(host.getByText("Président", { exact: false }).first()).toBeVisible();
  await expect(host.getByText("Trou du cul", { exact: false }).first()).toBeVisible();

  await Promise.all(contexts.map((c) => c.close()));
});
