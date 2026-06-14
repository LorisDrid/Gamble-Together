# Gamble Together 🎰

Casino-style mini-games to play solo or online with friends. **Fictional chips only — no real money, ever.**

> **Status**: three games playable, a tournament mode, persistent guest profiles and leaderboards. Polishing.

## Getting started

```bash
pnpm install
pnpm dev   # web on http://localhost:3000, game server on :3001
```

Open two browser tabs (or share the table code with a friend) to try multiplayer.

## Features

### Three mini-games
- **Blackjack** — hit / stand against the dealer. Players act **in parallel** (no turn order); the dealer plays once everyone is done. Rounds chain automatically.
- **European roulette** — a full clickable betting mat: straight numbers (35:1), dozens & columns (2:1), red/black, even/odd, 1-18/19-36. The result spins up a "counter" before landing.
- **No-limit Texas Hold'em** — blinds, raises, all-ins with side pots, split pots; hole cards stay private to each player. Chip-stack and pot-relative bet controls (Min / ½ Pot / Pot / Tapis).

### Tournament mode
Chain several mini-games into one tournament; the winner of each game scores a point, and the champion has the most points at the end.
- Pick which games to include (played in a fixed order).
- **Leg format toggle** — either a fixed number of rounds per game (chip leader wins) or **elimination** (last player standing wins).
- **Escalating stakes toggle** — each time a player is knocked out, the minimum bet (poker: blinds) rises, so it gets harder for the survivors. Rebuy is disabled in tournaments.

### Multiplayer & profiles
- **Private tables** by 4-letter code — one host creates, friends join with the code (up to 6 players). Solo works too (blackjack & roulette).
- **Persistent guest profiles** — your nickname and cumulative stats (rounds played, net total, biggest win) are saved per device, no account needed.
- **Leaderboards** — top players by net balance, biggest single win, or rounds played, with your own row highlighted.

### Design
3-colour casino theme (black / off-white / red), playing-card menus, dealing animations, a rules popup per game, and a responsive layout for phones.

## Tech overview

pnpm monorepo. The server is authoritative (all shuffles, spins and chip math happen server-side); the client only renders state and sends intents.

| Path | Role |
|------|------|
| `apps/web` | Next.js frontend (UI in French) |
| `apps/server` | Node + Socket.io authoritative game server; SQLite persistence (built-in `node:sqlite`) |
| `packages/shared` | Shared types, socket contracts, and pure, unit-tested game logic |

```bash
pnpm test        # unit tests (game logic)
pnpm typecheck   # typecheck all packages
pnpm build       # build all packages
```

Server env vars: `PORT` (default 3001), `CORS_ORIGIN` (default http://localhost:3000), `DB_PATH` (SQLite file, default `gamble.db`).
Web env var: `NEXT_PUBLIC_SERVER_URL` (default http://localhost:3001).

Designed to be self-hosted on a Raspberry Pi later — plain Node, no cloud lock-in, no native dependencies.

See [CLAUDE.md](CLAUDE.md) for architecture decisions and the full roadmap.
