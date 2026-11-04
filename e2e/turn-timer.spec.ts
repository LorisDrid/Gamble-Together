import { expect, test } from "@playwright/test";

test("an absent player's turn runs out and the hand moves on", async ({ browser }) => {
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

    // Host-only setting, 60 s by default, shared with the whole table
    const hostSetting = host!.getByRole("combobox", { name: "Temps par tour" });
    const guestSetting = guest!.getByRole("combobox", { name: "Temps par tour" });
    await expect(hostSetting).toHaveValue("60");
    await expect(guestSetting).toBeDisabled();
    await hostSetting.selectOption("30");
    await expect(guestSetting).toHaveValue("30");

    await host!.locator(".game-card", { hasText: "Poker" }).getByRole("button", { name: "Lancer" }).click();

    // Both screens show the countdown on the awaited player
    await expect(host!.getByTestId("turn-countdown")).toHaveCount(1);
    await expect(guest!.getByTestId("turn-countdown")).toHaveCount(1);
    await expect(host!.getByTestId("turn-countdown")).toHaveText(/^(30|29|28|27|26|25) s$/);

    // Nobody plays: heads-up, the small blind faces a bet, so it folds on its own
    await expect(host!.getByRole("button", { name: "Main suivante" })).toBeVisible({ timeout: 40_000 });
    await expect(host!.getByTestId("turn-countdown")).toHaveCount(0);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test("disabling the timer removes the countdown", async ({ page }) => {
  await page.goto("/");
  await page.fill("#nickname", "Bond");
  await page.getByRole("button", { name: "Créer une table" }).click();
  await expect(page).toHaveURL(/\/table\/[A-Z0-9]{4}$/);

  await page.getByRole("combobox", { name: "Temps par tour" }).selectOption("0");
  await page.locator(".game-card", { hasText: "Blackjack" }).getByRole("button", { name: "Lancer" }).click();
  await expect(page.getByText("Place ta mise")).toBeVisible();
  await expect(page.getByTestId("turn-countdown")).toHaveCount(0);

  // It can be turned back on from the table
  await page.getByRole("combobox", { name: "Temps par tour" }).selectOption("30");
  await expect(page.getByTestId("turn-countdown")).toHaveCount(1);
});
