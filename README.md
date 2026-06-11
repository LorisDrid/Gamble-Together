# Gamble Together 🎰

Casino-style mini-games to play solo or online with friends — blackjack, roulette, and more to come. Fictional chips only, no real money.

> **Status**: three playable games — blackjack, European roulette, and no-limit Texas Hold'em poker.

## Getting started

```bash
pnpm install
pnpm dev   # web on http://localhost:3000, game server on :3001
```

## How it will work

- Create a table, get a short code, share it with friends — they join with the code.
- Play solo against the dealer or together at the same table.
- Guest play with a nickname; accounts and persistent chips may come later.

## Tech overview

pnpm monorepo:

| Path | Role |
|------|------|
| `apps/web` | Next.js frontend (UI in French) |
| `apps/server` | Node + Socket.io authoritative game server |
| `packages/shared` | Shared types, socket contracts, pure game logic |

See [CLAUDE.md](CLAUDE.md) for architecture decisions and roadmap.
