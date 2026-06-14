# Gamble Together

Casino-style mini-games website (cards, roulette...) playable solo and in online multiplayer with friends. **Fictional chips only — no real money, ever.**

## Project status

**Tournament mode + games done; polishing.**

Tournament mode (a game MODE, not a mini-game): the host checks ≥2 mini-games in the lobby (`GamePicker` tournament card) + rounds-per-leg, then `tournament:start`. The server (RoomManager `Tournament` state + orchestration in `apps/server/src/index.ts`) chains the chosen games in fixed order (blackjack → roulette → poker), each as a "leg" of `roundsPerLeg` rounds. After a leg's Nth round settles (`progressAfterSettle` detects it via `settlement().round` reaching the cap), the chip leader(s) score 1 point (`endTournamentLeg`), then a 5s intermission (`INTERMISSION_MS`) before the next leg auto-starts (`startTournamentLeg`); after the last leg the tournament is `done`. Points are keyed by socket id. Broadcast on a separate `tournament:state` channel (TournamentView: games, legIndex, phase playing/intermission/done, standings, lastWinners) ALONGSIDE the leg's normal `game:state`; `RoomState.tournamentActive` keeps clients in the in-game view through intermissions. Client: `Tournament.tsx` renders a `.tournament-banner` (leg pills + progress) above the table during play, and a `.tournament-intermission` / `.tournament-end` overlay (standings, champion, host "Retour au lobby" → `game:end`) otherwise. Solo works for blackjack/roulette legs; a poker leg needs ≥2 players. NOTE poker chips are public so `gamePlayerChips` reads them from `getViewFor("")`.

**Phase 4 — Poker done. Phase 5 — UI overhaul in progress.** Three playable games: blackjack (hit/stand only — double/split come later; players act IN PARALLEL — no turn order, each hits/stands independently and the dealer plays once everyone is done, tracked by `BlackjackPlayerView.canAct`; rounds chain automatically — after payout the server auto-resets to betting after `NEXT_ROUND_DELAY_MS` (4s) via a per-room timer in `apps/server/src/index.ts`, no "next round" button), European roulette (full bet set: straight number 35:1, dozens & columns 2:1, red/black + even/odd + low(1-18)/high(19-36) 1:1), and no-limit Texas Hold'em cash game (blinds, raises, all-ins with side pots, split pots, big-blind option, heads-up rules, uncalled bets refunded; no turn timer — a player who leaves mid-hand is auto-folded). Poker hole cards are private: the server sends each player a personalized view via `getViewFor(playerId)` — never broadcast raw poker state.

Persistence (guest-first, no accounts/passwords): each browser generates a device token (`apps/web/src/lib/profile.ts`, stored in localStorage) sent via `profile:sync` on every socket (re)connect. The server keeps a tiny SQLite DB (`apps/server/src/db.ts`, built-in `node:sqlite` — no native deps, Pi-friendly; `DB_PATH` env var, default `gamble.db`, gitignored) with one `players` row per token: nickname + cumulative stats (`roundsPlayed`, `netTotal`, `biggestWin`). Chips stay per-table (fixed buy-in, unchanged) — only identity + stats persist. After each settled round the server folds every participant's net into their stats via `RoomManager.settlement(code)` + `recordSettlement` (guarded by a per-room `recordedRound` cursor so each round counts once; reset on game start/end). The home page shows a returning player's stats in a `.stats-row` card. Leaderboards build on this: `leaderboard:get(metric)` → `db.getLeaderboard()` returns the top 10 by `netTotal` / `biggestWin` / `roundsPlayed` (prepared statement per metric — the sort column is never interpolated from client input; rows need `nickname != '' AND rounds_played > 0`). The requester's own row is flagged `isMe` server-side via their `socketToken` (token itself never sent to clients). The home page renders a `Leaderboard.tsx` card with a metric toggle, highlighting the player's row; it re-fetches once the profile is synced (`refreshKey`/`syncTick`) so `isMe` is correct. Real accounts/login remain a later step; this lays the DB foundation.

UI design system (agreed): strict 3-color palette in a 60/30/10 split — black (`--noir`, backgrounds) / off-white (`--blanc`, "playing card" menu panels + text) / casino red (`--rouge`, CTAs and accents only). Fonts: Limelight (display, casino marquee) + Jost (body) via next/font. Menu panels use `.menu-card` with corner pips (data-pip attribute). Home + lobby are restyled (horizontal grids: `.duo`, `.game-row`; each game card shows an in-palette SVG illustration in `.game-art` — `GameArt.tsx` exports `BlackjackArt`/`RouletteArt`/`PokerArt`, swappable for real artwork later). Responsive: grids collapse to one column ≤720px; a `@media (max-width: 540px)` block at the very END of globals.css (so it overrides base rules — order matters, equal specificity) handles phones: `.bet-grid` to 2 columns, wrapping `.actions`/`.table-footer`, tighter paddings. All three game tables are restyled on a shared felt (`.game-table` with rail, `.seats`/`.seat` spots, `.chip-token` bets, `.verdict` pills, `.pcard` real playing cards). Blackjack betting: the player stacks chip-denomination buttons (`.chip-rack` / `.chip-btn` — 10 white, 50 black, 100 red, `CHIPS` const in `BlackjackTable.tsx`) into a local `pendingBet`, with Annuler (reset) and "Miser N" (commit via `blackjack:bet`) — purely client-side accumulation, the server still gets one `placeBet`. `pendingBet` resets each new round. Once a bet is placed it shows as a `.seat-bet` chip pinned to the seat's top-left corner (kept clear of the `.seat-foot` hand-total badge, which used to sit next to it and confused the user). Card game feel: `.pcard` deals in from the shoe (`deal-card`, 0.46s) staggered per hand-index (`animationDelay = index * 0.13s` via `PlayingCard`'s `index` prop) so a hand deals one card at a time; only newly-mounted cards animate (stable React keys). The dealer's hole card flips face-up on reveal (`PlayingCard flip` → `flip-card` keyframe, needs `perspective` on `.hand`). Chips/verdicts `pop-in`. Tunable timings live in those keyframes/props if the user wants the deal faster/slower. Poker adds `.poker-board` slots, `.dealer-chip`, pot badge; its bet/raise UI mirrors blackjack — chip buttons (`.chip-rack`) nudge a local `raiseTo` plus pot-relative presets (`.raise-presets`: Min / ½ Pot / Pot / Tapis) instead of a number input, committed via `poker:raise`; per-street bets show as `.seat-bet` corner chips. Poker cards animate too: community cards stagger only the ones NEW this street (a `prevCommunityLen` ref so the flop cascades but turn/river land promptly), own hole cards deal in, opponents' cards `flip` face-up at showdown. Roulette adds `.roulette-stage` (static `.roulette-wheel` conic-gradient motif during betting + the `.roulette-number` result disc). After validating, the result plays a "counter" spin: `RouletteTable` keeps local `rolling`/`displayNumber` state and a decelerating `setTimeout` chain (~2s, `SPIN_MS`) that flashes random numbers then lands on `winningNumber` — `.roulette-number.rolling` (glow, no reveal anim) + `.roulette-wheel.spinning` (`wheel-roll` finite) during the roll, then the landed disc pops via `result-reveal`. The outcome (seat net, the `.rcell.win` mat highlight, "Tour suivant") is gated behind `!rolling` for suspense. Respects `prefers-reduced-motion` (skips straight to the number). A future "realistic wheel + ball" variant was discussed for later. Betting is a real clickable mat: `RouletteBoard.tsx` renders the classic HORIZONTAL European layout — two stacked 14-col CSS grids (`.mat-numbers` then `.mat-outside`, flex-column with a gap between so the dozens sit clearly below the numbers), inline `gridColumn`/`gridRow` placement. `.mat-numbers`: 0 on the left spanning rows 1-3, the 1-36 numbers in 3 rows × 12 cols (red/black via `numberColor`), the three 2:1 column cells on the right. `.mat-outside`: the dozens row then the even-money row (1-18, Pair, Rouge, Noir, Impair, 19-36). Columns are `minmax(0, 1fr)` so the mat always fills its width with NO horizontal scrollbar (the in-game `main.wide` is 52rem to give it room). You pick a chip value (`.chip-rack` 10/50/100, `.selected` ring) then click a cell to drop it; a `.rstake` badge shows the running stake. The mat STAYS visible (read-only, `disabled`) after you validate and through the result phase — passing `winningNumber` highlights the winning cell (`.rcell.win`). Validate / Tout annuler / Passer below. Bet-type logic lives in `packages/shared` (`wheel.ts` `betWins`/`betPayout`/`dozenOf`/`columnOf`, `RouletteBet` union). Leaving is a single `.quit-tab` pill ("← Quitter", `room:leave` → home) fixed top-left of the in-game screen, mirroring the `.help-tab` "?" top-right — both rendered at the page level, not in game components. The user explicitly rejected a bottom `.table-footer` with separate "Quitter la table" + host "Terminer la partie pour tous" buttons; that host "end game → lobby" action currently has NO UI (the `game:end` socket event still exists server-side if we want to resurface it elsewhere). The "?" tab opens `RulesHelp` — a `.modal` popup with per-game rules (closes via ✕, Escape, or overlay click).

UI verification gotcha: the preview tab runs **hidden** (`document.visibilityState === "hidden"`), so CSS animations never advance (`currentTime` frozen at 0) and `preview_screenshot` hangs whenever any animation is active at capture time — this, not the animation being infinite per se, is why screenshots stall. To screenshot an animated screen: `preview_eval` → `document.getAnimations().forEach(a => a.finish())` first, then capture. Also avoid `backdrop-filter` (separately hangs the renderer). Finite animations are fine for real users (visible tab); keep them.

## Commands

```bash
pnpm install        # install everything (workspace root)
pnpm dev            # run web (localhost:3000) + server (localhost:3001) in parallel
pnpm test           # run unit tests (vitest, game logic in packages/shared)
pnpm typecheck      # typecheck all packages
pnpm build          # build all packages
```

Server env vars: `PORT` (default 3001), `CORS_ORIGIN` (default http://localhost:3000), `DB_PATH` (SQLite file, default `gamble.db`; `:memory:` for ephemeral).
Web env var: `NEXT_PUBLIC_SERVER_URL` (default http://localhost:3001).

## Key decisions (agreed, do not change without discussion)

- **Stack**: Next.js (React + TypeScript) frontend, dedicated Node.js + Socket.io server for real-time multiplayer.
- **Monorepo**: pnpm workspaces — `apps/web`, `apps/server`, `packages/shared`.
- **Games v1**: Blackjack (solo vs dealer + multiplayer table) and Roulette (validates the chip/betting system).
- **Players**: guest-first. v1 = nickname + session, chips not persisted server-side (localStorage at most). Architecture must keep the door open for real accounts + database later.
- **Multiplayer model**: private rooms joined by short code (e.g. `ABCD`). Host creates a table, friends enter the code. No public lobby or matchmaking in v1.
- **Language**: docs, code, comments in English. Website UI in French.
- **Hosting**: will be self-hosted on a friend's Raspberry Pi (ARM) once the project matures. No Vercel/cloud lock-in: both apps must run with plain Node (`next start`, `tsx src/index.ts`), avoid Vercel-only features, keep resource usage modest.

## Architecture

```
apps/
  web/        Next.js app — UI, lobby, game tables (renders state, sends player actions)
  server/     Node + Socket.io — authoritative game server: rooms, turn logic, chip ledger
packages/
  shared/     Shared TypeScript: socket event contracts, game state types, pure game logic
              (deck, hand evaluation, payouts) used by both web and server
```

### Core principles

- **Server is authoritative.** All randomness (shuffles, roulette spins) and chip math happen on the server. The client only displays state and submits intents. Never trust the client.
- **Pure game logic lives in `packages/shared`.** Deck handling, blackjack hand values, roulette payout tables, etc. are pure, side-effect-free TypeScript functions — easy to unit test, reusable for solo (client-side preview) and multi (server execution).
- **Socket events are typed contracts** defined once in `packages/shared` and imported by both sides.
- **One room = one game table.** Rooms hold the full game state; solo play is just a room with one player.

## Roadmap

1. **Phase 0 — Setup** ✅ docs + folder skeleton
2. **Phase 1 — Foundations** ✅ workspace config, Next.js + server bootstrap, shared package wiring, room create/join by code
3. **Phase 2 — Blackjack** ✅ hit/stand, configurable table settings, bets and chips, rebuy
4. **Phase 3 — Roulette** ✅ European wheel, red/black + even/odd + straight bets, multi-game generalization
5. **Phase 4 — Poker** ✅ no-limit Texas Hold'em cash game, side pots, per-player private views
6. **Phase 5 — UI overhaul** ✅ 3-color palette, restyled home/lobby/tables, animations, mobile, rules popup, roulette mat
7. **Phase 6 — Persistence** ✅ guest-first device profiles (SQLite): persistent nickname + cumulative stats
8. **Phase 7 — Leaderboards** ✅ top-10 by net / biggest win / rounds, own row highlighted, on the home page
9. **Phase 8 — Tournament mode** ✅ chain selected mini-games as legs, chip leader scores per leg, standings + champion
10. **Later**: real accounts/login, Raspberry Pi deployment, more games (double/split, slots…), realistic roulette wheel

## Conventions

- TypeScript everywhere, strict mode.
- Package manager: **pnpm** only (never npm/yarn commands).
- UI strings in French; identifiers, comments, commits in English.
- Game logic must be deterministic and unit-testable (inject RNG, don't call `Math.random()` deep inside logic).
