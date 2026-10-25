import { expect, test } from "@playwright/test";

test("the host's felt is synchronized with guests and survives their refresh", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const lateContext = await browser.newContext();
  try {
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();
    await host.goto("/");
    await host.fill("#nickname", "Alice");
    await host.getByRole("button", { name: "Créer une table" }).click();
    await expect(host).toHaveURL(/\/table\/[A-Z0-9]{4}$/);
    const code = host.url().split("/table/")[1]!;
    await guest.goto("/");
    await guest.fill("#nickname", "Bob");
    await guest.fill("#code", code);
    await guest.getByRole("button", { name: "Rejoindre" }).click();
    await expect(host.locator(".guest-list li")).toHaveCount(2);
    await host.locator(".game-card", { hasText: "Poker" }).getByRole("button", { name: "Lancer" }).click();
    await host.getByRole("combobox", { name: "Tapis de la table" }).selectOption("night");
    await expect(guest.locator("main")).toHaveAttribute("data-table-theme", "night");
    await expect(guest.getByRole("combobox", { name: "Tapis de la table" })).toBeDisabled();

    // A late arrival broadcasts another state without ending the active turn.
    const actor = await host.getByRole("button", { name: "Relancer", exact: true }).count() ? host : guest;
    await actor.getByRole("button", { name: "Relancer", exact: true }).click();
    await actor.locator(".raise-panel").getByRole("button", { name: "10", exact: true }).click();
    const amount = await actor.locator(".raise-panel .bet-summary strong").innerText();
    const late = await lateContext.newPage();
    await late.goto("/");
    await late.fill("#nickname", "Cara");
    await late.fill("#code", code);
    await late.getByRole("button", { name: "Rejoindre" }).click();
    await expect(actor.locator(".table-seat").getByText("Cara", { exact: true })).toBeVisible();
    await expect(actor.getByRole("button", { name: "Relancer", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(actor.locator(".raise-panel .bet-summary strong")).toHaveText(amount);
    await expect(actor.locator(".table-seat .table-player-badge").first()).toHaveCSS("position", "static");
    await expect(actor.locator(".player-zone > .table-player-badge")).toHaveCSS("position", "static");

    await guest.reload();
    await expect(guest.locator("main")).toHaveAttribute("data-table-theme", "night");
  } finally {
    await Promise.all([hostContext.close(), guestContext.close(), lateContext.close()]);
  }
});

test("touch preview and selection are separate from playing a president card", async ({ browser }) => {
  const contexts = await Promise.all(Array.from({ length: 3 }, () => browser.newContext({
    viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true,
  })));
  try {
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    const host = pages[0]!;
    await host.goto("/");
    await host.fill("#nickname", "Alice");
    await host.getByRole("button", { name: "Créer une table" }).click();
    await expect(host).toHaveURL(/\/table\/[A-Z0-9]{4}$/);
    const code = host.url().split("/table/")[1]!;
    for (const [index, guest] of pages.slice(1).entries()) {
      await guest.goto("/");
      await guest.fill("#nickname", `Guest${index}`);
      await guest.fill("#code", code);
      await guest.getByRole("button", { name: "Rejoindre" }).click();
    }
    await expect(host.locator(".guest-list li")).toHaveCount(3);
    await host.locator(".game-card", { hasText: "Président" }).getByRole("button", { name: "Lancer" }).click();
    for (const page of pages) await expect(page.getByTestId("president-table")).toBeVisible();
    // Short landscape screens must keep complete seat boxes above the hero bar.
    await expect.poll(() => host.locator(".table-stage").evaluate((stage) => {
      const bounds = stage.getBoundingClientRect();
      return [...stage.querySelectorAll("[data-table-seat]")].every((seat) => {
        const box = seat.getBoundingClientRect();
        return box.top >= bounds.top - 1 && box.bottom <= bounds.bottom + 1;
      });
    })).toBe(true);
    let active = pages[0]!;
    for (const page of pages) if (await page.getByTestId("play-btn").count()) active = page;
    const card = active.getByTestId("hand-card").last();
    const initialCount = await active.getByTestId("hand-card").count();
    await card.tap();
    await expect(active.getByRole("dialog", { name: "Aperçu de la carte" })).toBeVisible();
    await expect(active.getByTestId("play-btn")).toBeDisabled();
    await active.getByRole("button", { name: "Sélectionner", exact: true }).tap();
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await expect(active.getByTestId("hand-card")).toHaveCount(initialCount);
    await expect(active.getByTestId("play-btn")).toBeEnabled();
    await active.getByTestId("play-btn").tap();
    await expect(active.getByTestId("hand-card")).toHaveCount(initialCount - 1);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
