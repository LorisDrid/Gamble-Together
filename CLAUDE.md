# Gamble Together

Casino-style mini-games website (cards, roulette, dice...) playable solo and in online multiplayer with friends. **Fictional chips only — no real money, ever.**

## Project status

**Six games, tournament mode and robust sessions done; deployed and polishing.**

Live at https://gamble-together.lorisdrid.fr — web on Vercel, game server on Render's free tier (it sleeps when idle; an UptimeRobot monitor pings `HEAD /healthz` to keep it awake). Rooms live in the server's memory, so **every redeploy or restart ends all tables in progress**, and the free tier's SQLite file is wiped too: stats and leaderboard are hidden with `NEXT_PUBLIC_STATS_ENABLED=false` until storage is persistent. Self-host configs (`Dockerfile`, `docker-compose.yml`, `Caddyfile`) and the deploy guide live in `DEPLOYMENT.md`.

### Games

All engines are pure state machines in `packages/shared/src/games/<game>/` with an injected RNG. Tables hold up to `MAX_PLAYERS` = 6.

- **Blackjack** (1-6): players act IN PARALLEL — no turn order, each acts independently (`BlackjackPlayerView.canAct`) and the dealer plays once everyone is done. Double down and split (one split, split aces take one card, a 21 after a split pays 1:1; seats hold `hands[]`, legacy single-hand view fields kept). Rounds chain automatically: after payout the server resets to betting after `NEXT_ROUND_DELAY_MS` (4 s, plus `BLACKJACK_DEALER_REVEAL_MS` per dealer card drawn). **Sabotage** mode: a figure drawn on a hit may proc a secret power (Valet ±1, Dame swaps a card, Roi forces a dealer draw, As shield); powers are private per viewer until revealed; split is disabled in Sabotage.
- **Roulette** (1-6): European wheel, straight 35:1, dozens/columns 2:1, red/black, even/odd, low/high 1:1. Players validate (or pass); the wheel spins once every solvent player is ready.
- **Poker** (2-6): no-limit Texas Hold'em cash game — blinds, raises, all-ins with side pots, split pots, big-blind option, heads-up rules, uncalled bets refunded; a player who leaves mid-hand is auto-folded. Hole cards are private: the server sends each player `getViewFor(playerId)` — never broadcast raw poker state.
- **Président** (3-6, `PRESIDENT_MIN_PLAYERS`): turn-based shedding game, 52 cards, no jokers, the 2 has no special power. Lead or follow with N cards of one rank, equal or stronger; four of a rank in a row clear the pile; a quad played at once toggles the revolution. Ante into a pot paid out by finishing rank, top-heavy, the Trou du cul gets nothing; only players who finished the round are ranked and paid. From round 2, the exchange: low ranks give their best cards automatically, high ranks return cards of their choice.
- **Baccarat** (1-6): Punto Banco — bet Joueur / Banque (5 % commission) / Égalité 8:1, fixed third-card rules (`rules.ts`), then validate. Seats that staked bets take part even all-in.
- **Liar's Dice** (2-6): Perudo with wild 1s, ante into a pot, bid or call « Menteur ! »; dice are private per player; the last player with dice takes the pot. Not yet: Calza (exact), Palifico.

### Rooms and multiplayer

- **Rooms**: private, joined by a 4-character code. The host picks a game in the lobby (`GamePicker`: one card per game, a ⚙ per card for its settings, a player-count badge). In game, the host can send everyone back to the lobby with **« Retour au lobby »** in the header (two clicks: the first arms it for 4 s; emits `game:end`). Table settings are host-only and kept between games: felt (`room:theme`, `data-table-theme` wine / forest / night) and turn timer.
- **Tournament mode** (a mode, not a game): the host checks ≥ `MIN_TOURNAMENT_GAMES` (2) games and two toggles, then `tournament:start`. Only blackjack, roulette and poker can be legs, chained in that fixed order. A leg ends after `roundsPerLeg` rounds (« Limiter par manches » ON → chip leader wins) OR by elimination when only one player can still play (OFF). Optional « Mises croissantes » (`escalate`): each knockout raises the min bet (poker: blinds) to base × (eliminated + 1) — engines expose `setMinBet`/`setBlinds`, applied via `tournamentAfterRound`, which also detects eliminations and the elimination leg-end. Rebuy is disabled during tournaments (broke = out of the current leg; reset next leg). The leg point goes to the chip leader(s) (`endTournamentLeg`), then a 5 s intermission (`INTERMISSION_MS`) before the next leg (`startTournamentLeg`). Points are keyed by player id. Broadcast on a separate `tournament:state` channel alongside the leg's `game:state`; `RoomState.tournamentActive` keeps clients in the in-game view through intermissions. Client: `Tournament.tsx` (banner during play, intermission / final standings overlay otherwise). NOTE poker chips are public, so `gamePlayerChips` reads them from `getViewFor("")`.
- **Reconnection**: a player's id is their socket id at first join, then stays the same for that seat (`RoomManager` maps socket → seat in `seatBySocket`; engines, tournament points and per-player channels only know the player id, and each socket joins a Socket.io channel named after it). The device token travels in the Socket.io handshake (`auth.token`) and is kept server-side in `Room.links`, never in `RoomState`. On disconnect the seat stays in play, flagged `Player.connected = false`, for `RECONNECT_GRACE_MS` (2 min, `apps/server/src/index.ts`); `room:join` with the same token takes it back (same chips and cards, even if the room is full), otherwise `expireSeat` removes it as a normal departure. `room:leave` stays immediate. The table page re-emits `room:join` on every socket `connect`. The newest connection wins: an older live socket gets `session:replaced` and is cut, and the client opens a fresh one — so **two tabs of one browser share a seat; use a private window or another browser to test as a second player**. `OfflinePlayersContext` feeds the « Déconnecté » tag (`OfflineTag`) on seats. A held seat stays in the game and on the turn clock.
- **Turn timer**: `RoomState.turnTimer` (host setting via `room:turnTimer`: off / 30 / 60 / 90 s, 60 by default; the select is in the lobby and the in-game header). `apps/server/src/rooms/autoPlay.ts` holds `pendingDecision` (who the table is waiting for, plus a `key` identifying the situation) and `playDefault`. `syncTurnTimer` in `apps/server/src/index.ts` runs after every game broadcast: it restarts the per-room countdown when the `key` changes, and emits `turn:timer` (a remaining duration, since device clocks differ; null when nobody is awaited). Parallel-play phases share one countdown. Defaults on timeout: poker checks or else folds; Président passes, leads with its weakest card, returns its weakest cards in the exchange; Liar's Dice makes `smallestRaise` and never challenges; blackjack stands and gives up a held power, and `skipRound` during betting (skippers can still bet until the deal; if everyone skips, the table waits); roulette and baccarat `setReady`, so bets already placed stand. "Next round" buttons work for anyone and are never timed, so an idle table stops by itself. Client: `TurnClockContext` + `TurnCountdown` (`components/TurnTimer.tsx`), pinned on the seat so it doesn't shift the layout.
- **Untrusted input**: any client can send any message (CORS only binds browsers), and rooms live in memory, so one throwing handler used to kill every table. `apps/server/src/socketGuard.ts` lists, for every client event, where its callback sits (`ACK_POSITION`, typed against `ClientToServerEvents` so a new event fails to compile until listed); a `socket.use` middleware drops unknown or misshapen messages before any handler runs. Handlers and engines still validate values (and must treat payloads as `unknown`-ish: null, wrong types, inherited names like "constructor"). A last-resort `uncaughtException` handler logs instead of exiting.

### Persistence

Guest-first, no accounts or passwords: each browser generates a device token (`apps/web/src/lib/profile.ts`, localStorage), sent in the socket handshake and via `profile:sync` on every (re)connect. The server keeps a tiny SQLite DB (`apps/server/src/db.ts`, built-in `node:sqlite` — no native deps; `DB_PATH` env var, default `gamble.db`, gitignored) with one `players` row per token: nickname + cumulative stats (`roundsPlayed`, `netTotal`, `biggestWin`). Chips stay per-table (fixed buy-in) — only identity + stats persist. After each settled round the server folds every participant's net into their stats via `RoomManager.settlement(code)` (guarded by a per-room `recordedRound` cursor so each round counts once; reset on game start/end). `leaderboard:get(metric)` → `db.getLeaderboard()` returns the top 10 by `netTotal` / `biggestWin` / `roundsPlayed` (one prepared statement per metric, only own keys accepted — the sort column is never interpolated from client input). The requester's own row is flagged `isMe` server-side via their `socketToken` (the token itself is never sent to clients). Home page: a `.stats-row` card and `Leaderboard.tsx`, both behind `STATS_ENABLED` (`lib/features.ts`). Real accounts/login remain a later step.

### UI

Design system (agreed): strict 3-color palette in a 60/30/10 split — black (`--noir`, backgrounds) / off-white (`--blanc`, "playing card" menu panels + text) / casino red (`--rouge`, CTAs and accents only). Fonts: Limelight (display, casino marquee) + Jost (body) via next/font. Menu panels use `.menu-card` with corner pips (`data-pip`). UI strings are plain and factual — no marketing taglines. Home + lobby use horizontal grids (`.duo`, `.game-row`); each game card shows an in-palette SVG from `GameArt.tsx`. A `@media (max-width: 540px)` block at the very END of `globals.css` handles phones (order matters, equal specificity).

- **Shared table** (`TableStage.tsx` + `app/table-experience.css`, imported first by `globals.css`): used by blackjack, poker, Président, Liar's Dice and baccarat. The felt sits in `.integrated-table`; the viewer is never drawn on it — opponents are placed symmetrically around it by `SEAT_POS` (keyed by opponent count, clockwise from the viewer's left neighbour, so neighbours keep their sides). Games pass `seats`, a `center` (board, dealer, pile, bid…), the viewer's `self` zone and their `actions`; the `.self-bar` below the felt shows the chip stack (`.table-bank`), a status line, the viewer's zone and the controls. Player badges: `TablePlayer.tsx` (`.table-player-badge`, distinct from the lobby's `.player-badge` count). Own cards: `CardHand.tsx` fans them with a larger preview portalled into `.integrated-table`; with a mouse a click selects (Président), on touch a tap opens the preview, which has the select button.
- **Roulette** still uses the older `.game-table` felt: `.roulette-stage`, a counter-style spin (`SPIN_MS`, skipped with `prefers-reduced-motion`), and a clickable horizontal European mat (`RouletteBoard.tsx`, two 14-column grids, `minmax(0, 1fr)` so it never scrolls) that stays visible read-only through the result, highlighting the winning cell.
- **Bets**: chip-denomination buttons (`.chip-rack` / `.chip-btn`: 10 white, 50 black, 100 red) build a local amount (blackjack `pendingBet`, poker `raiseTo` plus `.raise-presets` Min / ½ Pot / Pot / Tapis), committed in one message.
- **Card feel**: `.pcard` deals in (`deal-card`) staggered by hand index; the dealer's hole card and opponents' poker cards flip (`flip-card`); poker staggers only the community cards new this street (`prevCommunityLen`).
- **Page chrome**: `.quit-tab` « ← Quitter » top-left and the `.help-tab` « ? » rules popup (`RulesHelp`, all six games) top-right, rendered by the page. The in-game header (`.game-header`) holds the host settings and « Retour au lobby ». The user explicitly rejected a bottom `.table-footer` with "Quitter la table" + "Terminer la partie pour tous" buttons — keep that out. `ServerStatus` shows a banner while the socket is (re)connecting, explaining the free tier's slow wake-up.

UI verification gotcha: the preview tab runs **hidden** (`document.visibilityState === "hidden"`), so CSS animations never advance (`currentTime` frozen at 0) and screenshots hang whenever an animation is active at capture time. To screenshot an animated screen, first run `document.getAnimations().forEach(a => a.finish())` in the page. Also avoid `backdrop-filter` (separately hangs the renderer). Finite animations are fine for real users (visible tab); keep them.

## Commands

```bash
pnpm install        # install everything (workspace root)
pnpm dev            # run web (localhost:3000) + server (localhost:3001) in parallel
pnpm test           # unit tests (vitest: engines in packages/shared, rooms in apps/server)
pnpm typecheck      # typecheck all packages
pnpm e2e            # Playwright end-to-end tests (boots both servers, in-memory DB)
pnpm build          # build all packages
```

CI (`.github/workflows/ci.yml`) runs typecheck, unit tests and E2E on every PR and push to main. The runner is pinned to `ubuntu-24.04`: Playwright can only install Chromium on Ubuntu releases it supports, so bump the runner together with Playwright.

Server env vars: `PORT` (default 3001), `CORS_ORIGIN` (default http://localhost:3000), `DB_PATH` (SQLite file, default `gamble.db`; `:memory:` for ephemeral).
Web env vars: `NEXT_PUBLIC_SERVER_URL` (default http://localhost:3001), `NEXT_PUBLIC_STATS_ENABLED` (`"false"` hides stats and leaderboard).

## Key decisions (agreed, do not change without discussion)

- **Stack**: Next.js (React + TypeScript) frontend, dedicated Node.js + Socket.io server for real-time multiplayer.
- **Monorepo**: pnpm workspaces — `apps/web`, `apps/server`, `packages/shared`.
- **Games v1**: Blackjack (solo vs dealer + multiplayer table) and Roulette (validates the chip/betting system).
- **Players**: guest-first. v1 = nickname + session, chips not persisted server-side (localStorage at most). Architecture must keep the door open for real accounts + database later.
- **Multiplayer model**: private rooms joined by short code (e.g. `ABCD`). Host creates a table, friends enter the code. No public lobby or matchmaking in v1.
- **Language**: docs, code, comments in English. Website UI in French.
- **Hosting**: will be self-hosted on a friend's Raspberry Pi (ARM) once the project matures. No Vercel/cloud lock-in: both apps must run with plain Node (`next start`, `tsx src/index.ts`), avoid Vercel-only features, keep resource usage modest. (Vercel + Render are the current stopgap.)

## Architecture

```
apps/
  web/        Next.js app — UI, lobby, game tables (renders state, sends player actions)
  server/     Node + Socket.io — authoritative game server: rooms, turn logic, chip ledger
packages/
  shared/     Shared TypeScript: socket event contracts, game state types, pure game logic
              (deck, hand evaluation, payouts) used by both web and server
e2e/          Playwright specs, one browser context per player
```

### Core principles

- **Server is authoritative.** All randomness (shuffles, roulette spins, dice) and chip math happen on the server. The client only displays state and submits intents. Never trust the client.
- **Pure game logic lives in `packages/shared`.** Deck handling, hand values, payout tables, etc. are pure, side-effect-free TypeScript — easy to unit test, reusable by web and server.
- **Socket events are typed contracts** defined once in `packages/shared` and imported by both sides (and listed in `socketGuard.ts`).
- **One room = one game table.** Rooms hold the full game state; solo play is just a room with one player.
- **Private information stays per viewer**: games with hidden cards or dice (poker, Président, Liar's Dice, Sabotage blackjack) broadcast one view per player.

## Roadmap

1. **Phase 0 — Setup** ✅ docs + folder skeleton
2. **Phase 1 — Foundations** ✅ workspace config, Next.js + server bootstrap, shared package wiring, room create/join by code
3. **Phase 2 — Blackjack** ✅ hit/stand, configurable table settings, bets and chips, rebuy
4. **Phase 3 — Roulette** ✅ European wheel, full bet set, multi-game generalization
5. **Phase 4 — Poker** ✅ no-limit Texas Hold'em cash game, side pots, per-player private views
6. **Phase 5 — UI overhaul** ✅ 3-color palette, restyled home/lobby/tables, animations, mobile, rules popup, roulette mat
7. **Phase 6 — Persistence** ✅ guest-first device profiles (SQLite): persistent nickname + cumulative stats
8. **Phase 7 — Leaderboards** ✅ top-10 by net / biggest win / rounds, own row highlighted, on the home page
9. **Phase 8 — Tournament mode** ✅ chain selected mini-games as legs, chip leader scores per leg, standings + champion
10. **Phase 9 — More games** ✅ blackjack double/split + Sabotage, Président, Baccarat, Liar's Dice
11. **Phase 10 — Deployment** ✅ Vercel + Render free tier, health endpoint, wake-up banner, E2E in CI
12. **Phase 11 — Real tables** ✅ shared seated layout, card fan, host felt, return to lobby
13. **Phase 12 — Robust sessions** ✅ seat kept 2 min on reconnect, host-set turn timer, malformed-message guard
14. **Next**: persistent hosting (stats back on, no table loss on deploy); tournament legs for the other 3 games; one generic server path per game; roulette on the shared table, then a realistic wheel + ball
15. **Later**: real accounts/login with a shared chip wallet, more games (Crash, Belote…), Liar's Dice Calza/Palifico

## Git workflow

- **One branch per topic**, short-lived, named with a conventional-commit type: `feat/`, `fix/`, `chore/`, `docs/`, `test/`, `ci/`, `refactor/` + a short slug (`fix/baccarat-all-in`).
- **Start from an up-to-date `main`**. A branch Claude creates (only when asked) is cut with `git fetch` then `git switch -c <branch> --no-track origin/main`, so a plain `git push` can never target `main`.
- **Batch branch**: several small, independent fixes found in one session may share one throwaway branch (`chore/<slug>`), with **one commit per fix** so each can be reverted alone. Anything bigger gets its own branch.
- **No long-lived or reused branches**: a branch is deleted once merged (GitHub auto-deletes head branches); the next topic starts a new one from `main`.
- Commit messages follow conventional commits; Claude proposes them (and the matching `git add` per commit) but never commits, pushes or merges.

## Conventions

- TypeScript everywhere, strict mode.
- Package manager: **pnpm** only (never npm/yarn commands).
- UI strings in French; identifiers, comments, commits in English.
- Game logic must be deterministic and unit-testable (inject RNG, don't call `Math.random()` deep inside logic).
- **Git: Claude must NOT commit, push, merge, or open PRs.** Implement and verify (tests, typecheck, E2E), then leave the changes uncommitted in the working tree — the human owns all git operations. Do not add `Co-Authored-By` trailers (no commits at all).
