# Gamble Together

Casino-style mini-games website (cards, roulette...) playable solo and in online multiplayer with friends. **Fictional chips only — no real money, ever.**

## Project status

**Phase 0 — Setup.** No code yet. Only docs and folder structure exist. Do not add code, dependencies, or config files unless explicitly asked.

## Key decisions (agreed, do not change without discussion)

- **Stack**: Next.js (React + TypeScript) frontend, dedicated Node.js + Socket.io server for real-time multiplayer.
- **Monorepo**: pnpm workspaces — `apps/web`, `apps/server`, `packages/shared`.
- **Games v1**: Blackjack (solo vs dealer + multiplayer table) and Roulette (validates the chip/betting system).
- **Players**: guest-first. v1 = nickname + session, chips not persisted server-side (localStorage at most). Architecture must keep the door open for real accounts + database later.
- **Multiplayer model**: private rooms joined by short code (e.g. `ABCD`). Host creates a table, friends enter the code. No public lobby or matchmaking in v1.
- **Language**: docs, code, comments in English. Website UI in French.

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

1. **Phase 0 — Setup** ✅ docs + folder skeleton (current)
2. **Phase 1 — Foundations**: workspace config, Next.js + server bootstrap, shared package wiring, room create/join by code
3. **Phase 2 — Blackjack**: solo first, then multiplayer table
4. **Phase 3 — Roulette**: betting board + chip system
5. **Later**: accounts + database (persistent chips), leaderboards, more games (poker, slots)

## Conventions

- TypeScript everywhere, strict mode.
- Package manager: **pnpm** only (never npm/yarn commands).
- UI strings in French; identifiers, comments, commits in English.
- Game logic must be deterministic and unit-testable (inject RNG, don't call `Math.random()` deep inside logic).
