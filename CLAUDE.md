# Gamble Together

Casino-style mini-games website (cards, roulette...) playable solo and in online multiplayer with friends. **Fictional chips only — no real money, ever.**

## Project status

**Phase 4 — Poker done. Phase 5 — UI overhaul in progress.** Three playable games: blackjack (hit/stand only — double/split come later), European roulette (red/black, even/odd, straight number), and no-limit Texas Hold'em cash game (blinds, raises, all-ins with side pots, split pots, big-blind option, heads-up rules, uncalled bets refunded; no turn timer — a player who leaves mid-hand is auto-folded). Poker hole cards are private: the server sends each player a personalized view via `getViewFor(playerId)` — never broadcast raw poker state.

UI design system (agreed): strict 3-color palette in a 60/30/10 split — black (`--noir`, backgrounds) / off-white (`--blanc`, "playing card" menu panels + text) / casino red (`--rouge`, CTAs and accents only). Fonts: Limelight (display, casino marquee) + Jost (body) via next/font. Menu panels use `.menu-card` with corner pips (data-pip attribute). Home + lobby are restyled (horizontal grids: `.duo`, `.game-row` with `.game-art` image placeholders). All three game tables are restyled on a shared felt (`.game-table` with rail, `.seats`/`.seat` spots, `.chip-token` bets, `.verdict` pills, `.pcard` real playing cards). Poker adds `.poker-board` slots, `.dealer-chip`, pot badge. Roulette adds `.roulette-stage` (static `.roulette-wheel` conic-gradient motif during betting + the `.roulette-number` result disc, which plays a finite `result-reveal` spin-in on the winning number). Betting uses a clickable `.bet-grid` (red/black/even/odd cells, with `.stake` chips stacked on cells the player bet on) plus a `.straight-row`: a small labelled "Numéro (0-36)" input picks the number, the button reads "Miser sur le N · 35:1". Two distinct inputs in the action card — the wide "Valeur du jeton" (chip amount applied to every cell click) vs the small straight-bet number — confused the user once; keep them clearly labelled. "Quitter la table" + host-only "Terminer la partie pour tous" (`.ghost-btn`, deliberately discreet — user disliked a prominent end button) live in the page-level `.table-footer`, not in game components. A floating "?" tab (`.help-tab`, fixed top-right) opens `RulesHelp` — a `.modal` popup with per-game rules (closes via ✕, Escape, or overlay click).

UI verification gotcha: the preview tab runs **hidden** (`document.visibilityState === "hidden"`), so CSS animations never advance (`currentTime` frozen at 0) and `preview_screenshot` hangs whenever any animation is active at capture time — this, not the animation being infinite per se, is why screenshots stall. To screenshot an animated screen: `preview_eval` → `document.getAnimations().forEach(a => a.finish())` first, then capture. Also avoid `backdrop-filter` (separately hangs the renderer). Finite animations are fine for real users (visible tab); keep them.

## Commands

```bash
pnpm install        # install everything (workspace root)
pnpm dev            # run web (localhost:3000) + server (localhost:3001) in parallel
pnpm test           # run unit tests (vitest, game logic in packages/shared)
pnpm typecheck      # typecheck all packages
pnpm build          # build all packages
```

Server env vars: `PORT` (default 3001), `CORS_ORIGIN` (default http://localhost:3000).
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
6. **Later**: big UI/UX overhaul (animations, mobile), accounts + database (persistent chips), leaderboards, more games

## Conventions

- TypeScript everywhere, strict mode.
- Package manager: **pnpm** only (never npm/yarn commands).
- UI strings in French; identifiers, comments, commits in English.
- Game logic must be deterministic and unit-testable (inject RNG, don't call `Math.random()` deep inside logic).
