# Deployment

The code is host-agnostic: nothing changes between targets except environment
variables. Two targets are configured and can coexist in the repo.

| Component           | Stopgap (cloud)        | Future (self-hosted)         |
| ------------------- | ---------------------- | ---------------------------- |
| Web (Next.js)       | **Vercel**             | mini PC (Docker)             |
| Server (Socket.io)  | **Render**             | mini PC (Docker)             |

> **Why split for the cloud?** Vercel is serverless and cannot hold the
> persistent WebSocket connections Socket.io needs, so the server runs on Render
> (a long-lived Node process) while Vercel serves only the front-end.

Runtime is **Node 24** everywhere (`node:sqlite` needs ≥ 22.5); pinned in
`.node-version`.

## Environment variables

| Var                      | Side   | Meaning                                              |
| ------------------------ | ------ | ---------------------------------------------------- |
| `PORT`                   | server | Listen port (Render injects its own).                |
| `CORS_ORIGIN`            | server | Exact web origin allowed to connect, no slash.       |
| `DB_PATH`                | server | SQLite file; absolute path on a volume in prod.      |
| `NEXT_PUBLIC_SERVER_URL` | web    | Server URL, **inlined at build time**.               |
| `NEXT_PUBLIC_STATS_ENABLED` | web | `"false"` hides stats + leaderboard (ephemeral DB). Default on. |

See `apps/server/.env.example` and `apps/web/.env.example`.

---

## Target A — Vercel + Render (cloud stopgap)

### 1. Server on Render

The server install/start commands are in `render.yaml` (a Render Blueprint). In
the Render dashboard: **New → Blueprint**, point it at this repo, then set
`CORS_ORIGIN` to your Vercel URL once you have it.

The blueprint uses a **paid `starter` instance** (no idle sleep, so no cold
starts) with a **1 GB persistent disk** mounted at `/var/data`, and sets
`DB_PATH=/var/data/gamble.db` so the SQLite stats/leaderboard survive deploys
and restarts.

Render gives you a URL like `https://gamble-together-server.onrender.com`.

### 2. Web on Vercel

In the Vercel dashboard: **New Project** → import this repo, then:

- **Root Directory:** `apps/web`
- **Framework:** Next.js (auto-detected)
- **Environment variables:**
  - `NEXT_PUBLIC_SERVER_URL` = your Render URL
  - `NEXT_PUBLIC_STATS_ENABLED` = `false` **if the server runs on a free/ephemeral
    tier** (no persistent disk): this hides the returning-player stats and the
    leaderboard, which would otherwise reset on every restart. Remove it (default
    on) once the DB is persistent (paid Render disk, or the self-hosted mini PC).
- Node version: 24 (from `.node-version`; override in project settings if needed)

Deploy, copy the resulting `*.vercel.app` URL back into Render's `CORS_ORIGIN`,
and redeploy the server. Done.

---

## Target B — mini PC (Docker + Caddy, self-hosted)

Everything runs on one machine behind Caddy, which terminates TLS and routes the
same domain to both apps (so the browser talks to a single origin, no CORS).

Files: `Dockerfile`, `docker-compose.yml`, `Caddyfile`.

### Steps

1. Point `gamble-together.lorisdrid.fr` (DNS A/AAAA) at the machine's public IP
   and forward router ports **80** and **443** to it.
2. Create a `.env` next to `docker-compose.yml`:

   ```
   PUBLIC_URL=https://gamble-together.lorisdrid.fr
   ```

3. Bring it up:

   ```bash
   docker compose up -d --build
   ```

Caddy fetches a Let's Encrypt certificate automatically. The SQLite DB lives in
the `gamble-db` Docker volume, so stats survive restarts and rebuilds.

### Notes

- `NEXT_PUBLIC_SERVER_URL` is baked into the web build via the `PUBLIC_URL`
  build arg — rebuild (`--build`) if the domain changes.
- The server runs TypeScript directly through `tsx`; only the web app has a
  build step, so the image stays simple (one build, two run commands).
- To host other projects later, add their services to a shared Caddy config and
  give each its own subdomain — this compose file is a template for that.
