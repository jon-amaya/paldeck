# Paldeck

A self-hostable **Palworld dedicated-server control panel**. One Go binary:
REST API + WebSocket log streaming driving Docker, SQLite state, and an
embedded React operator console — create, run, and watch multiple Palworld
servers from one place.

## What it does today

- **Create servers** with real Palworld settings (name, description, max
  players, difficulty, join/admin passwords, PvP) — each server runs isolated
  in its own Docker container (`thijsvanloef/palworld-server-docker`).
- **Ports auto-assigned** from a pool (game 8211+, query 27015+N, rcon 25575+N)
  — allocation is transactional, so concurrent creates can't collide.
- **Start / stop / restart / delete** with live feedback (pending states,
  spinners). Stop is graceful (90s) so the world saves before exit.
- **Live console**: WebSocket log stream with ANSI colors rendered, real
  daemon-side timestamps, `\r` progress handling, and a 1000-line cap.
- **Worlds survive**: each server owns a named volume (`paldeck-<id>`) mounted
  at `/palworld`; deleting a server keeps its world.
- **Operator UI**: dark "ops console" — sidebar with live server list, dense
  server table, tabbed detail view (Overview / Console / Players / Settings).

## Stack

| Layer | Choice |
|---|---|
| Backend | Go — `net/http` (1.22 routing), first-party Docker SDK, `coder/websocket`, `modernc.org/sqlite` (pure Go, no CGO) |
| Frontend | React + Vite + TypeScript (`frontend/`), Inter UI font, Cascadia Code console |
| State | SQLite (WAL, single-writer) |
| Runtime | Docker Engine (dev: inside WSL2; prod: any Linux host with Docker) |

## Develop

Prereqs (Linux / WSL2 Ubuntu): Go 1.25+, Docker Engine (daemon running,
user in the `docker` group), Node 20+ (nvm).

Two processes in dev — Go serves the API, Vite serves the UI with hot reload
and proxies `/api` (including the WebSocket) to it:

```bash
# terminal 1 — API on :8080
go run .

# terminal 2 — UI on :5173 (proxies /api → :8080)
cd frontend && npm install && npm run dev
```

Develop against **http://localhost:5173**.

> `go run .` embeds `frontend/dist`, so run `cd frontend && npm run build`
> once before the first Go build.

## Ship (single binary)

```bash
cd frontend && npm run build     # → frontend/dist
cd .. && go build -o paldeck .   # embeds dist → one file
./paldeck                        # serves UI + API on :8080
```

Config via env: `PALDECK_ADDR` (default `:8080`), `PALDECK_DB` (default
`paldeck.db`). Docker connection via the standard `DOCKER_HOST` /
`/var/run/docker.sock`.

## API

| Method | Path | Does |
|--------|------|------|
| GET | `/api/health` | liveness |
| GET | `/api/servers` | list servers + live Docker status |
| POST | `/api/servers` | create — `{name, description?, maxPlayers?, serverPassword?, adminPassword?, difficulty?, pvp?}`; response includes the admin password **once** |
| POST | `/api/servers/{id}/start` \| `/stop` \| `/restart` | lifecycle (stop/restart wait for the container, up to ~90s) |
| DELETE | `/api/servers/{id}` | remove the container (world volume kept) |
| GET | `/api/servers/{id}/logs` | **WebSocket** — live log stream (ANSI + RFC3339 timestamps) |

## Project docs

Spec-driven: `docs/CONSTITUTION.md` (rules & locked stack), `docs/ROADMAP.md`
(phases), `specs/<nnn>-*/` (spec / plan / tasks per feature). Specs 001–002
(core + console) are complete and stress-tested.

## Next (see ROADMAP)

- **003 — operator controls:** broadcast, scheduled restarts, update-on-demand,
  live metrics (players/CPU/memory via Palworld REST API + Docker stats),
  RCON-first graceful shutdown.
- **004 — Pal Search:** parse `Level.sav` (GVAS) in Go — captured Pals, IVs,
  breeding tools.
- **005 — sharing:** Caddy reverse proxy + NetBird mesh for remote access.
