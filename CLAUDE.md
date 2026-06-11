# Gamble Together

Casino-style mini-games website (cards, roulette...) playable solo and in online multiplayer with friends. **Fictional chips only — no real money, ever.**

## Project status

**Phase 3 — Roulette done.** Two playable games: blackjack (hit/stand only — double/split come later) and European roulette (single zero; bets: red/black, even/odd, straight number — other bet types come later; everyone validates their bets, then the wheel spins automatically). The game layer is generalized: `game:start` takes a game kind + settings, `game:state` broadcasts a tagged union, the room holds either game. The host picks a game in the lobby and tweaks its settings via the gear icon — this is the pattern for all future games. Broke players can rebuy (fictional chips). Next up: poker (variant to be discussed), then decide between another game and the big UI overhaul.

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
5. **Phase 4 — Poker** (variant to be discussed)
6. **Later**: big UI/UX overhaul (animations, mobile), accounts + database (persistent chips), leaderboards, more games

## Conventions

- TypeScript everywhere, strict mode.
- Package manager: **pnpm** only (never npm/yarn commands).
- UI strings in French; identifiers, comments, commits in English.
- Game logic must be deterministic and unit-testable (inject RNG, don't call `Math.random()` deep inside logic).
