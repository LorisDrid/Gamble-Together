import { expect, test, type Page } from "@playwright/test";

async function createTable(page: Page, nickname: string): Promise<string> {
  await page.goto("/");
  await page.fill("#nickname", nickname);
  await page.getByRole("button", { name: "Créer une table" }).click();
  await expect(page).toHaveURL(/\/table\/[A-Z0-9]{4}$/);
  return page.url().split("/table/")[1]!;
}

test("refreshing mid-game keeps the seat and the chips", async ({ page }) => {
  await createTable(page, "Bond");
  await page
    .locator(".game-card", { hasText: "Blackjack" })
    .getByRole("button", { name: "Lancer" })
    .click();
  await expect(page.getByText("Place ta mise")).toBeVisible();

  await page.locator(".chip-btn", { hasText: "100" }).click();
  await page.getByRole("button", { name: /^Miser/ }).click();
  const bank = page.locator(".table-bank strong");
  await expect(bank).not.toHaveText(/^1\s?000$/);
  const chips = await bank.innerText();

  await page.reload();

  await expect(bank).toHaveText(chips);
  await expect(page.locator(".game-card")).toHaveCount(0);
});

test("a dropped player is flagged, then takes their seat back", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  try {
    const host = await hostContext.newPage();
    const code = await createTable(host, "Alice");

    const guest = await guestContext.newPage();
    await guest.goto("/");
    await guest.fill("#nickname", "Bob");
    await guest.fill("#code", code);
    await guest.getByRole("button", { name: "Rejoindre" }).click();
    await expect(host.locator(".guest-list li")).toHaveCount(2);
    await expect(host.locator(".offline-tag")).toHaveCount(0);

    await guest.close();
    await expect(host.locator(".guest-list li", { hasText: "Bob" }).locator(".offline-tag")).toBeVisible();
    await expect(host.locator(".guest-list li")).toHaveCount(2);

    const back = await guestContext.newPage();
    await back.goto(`/table/${code}`);
    await expect(back.locator(".guest-list li", { hasText: "(toi)" })).toContainText("Bob");
    await expect(host.locator(".offline-tag")).toHaveCount(0);
    await expect(host.locator(".guest-list li")).toHaveCount(2);
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()]);
  }
});

test("opening the table in a second tab takes the seat over", async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const first = await context.newPage();
    const code = await createTable(first, "Alice");

    const second = await context.newPage();
    await second.goto(`/table/${code}`);
    await expect(second.locator(".guest-list li")).toHaveCount(1);
    await expect(second.getByRole("heading", { name: "Code de la table" })).toBeVisible();
    await expect(first.getByText("ouverte ailleurs")).toBeVisible();

    // The replaced tab can still start over with a working connection
    await first.getByRole("button", { name: "Retour à l’accueil" }).click();
    await first.getByRole("button", { name: "Créer une table" }).click();
    await expect(first).not.toHaveURL(new RegExp(code));
    await expect(first).toHaveURL(/\/table\/[A-Z0-9]{4}$/);
  } finally {
    await context.close();
  }
});
