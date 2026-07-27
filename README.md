# Paldeck

A self-hostable **Palworld dedicated-server control panel**. One Go binary —
REST API, WebSocket log streaming, and an embedded React operator console —
drives Docker to create, run, and manage multiple Palworld servers from a
single dark "ops console" UI.

## What it does

**Server lifecycle**
- Create servers with real Palworld settings (name, description, max players,
  difficulty, join/admin passwords, PvP, timezone, multithreading, public IP)
  — each runs isolated in its own Docker container
  (`thijsvanloef/palworld-server-docker`), on its own auto-assigned or
  manually-pinned ports.
- Start / stop / restart / delete with live feedback. Stop is graceful (RCON
  save, then up to 90s) so the world always saves before the container exits.
- Live console: WebSocket log stream with ANSI colors, real daemon-side
  timestamps, and an in-browser RCON command line.
- Import an existing, unmanaged Palworld server's save into a brand-new
  Paldeck-managed server — bring an "OG" hand-run world under management
  without losing it.

**Operating a running server**
- Live metrics (players online, CPU, memory, FPS, in-game day, version),
  polled and charted.
- Player roster with kick/ban — shows who's online now *and* who's played
  before but is currently offline, with a last-seen timestamp pulled from the
  world save's own guild data.
- Broadcast messages, restore from the image's own hourly world backups, edit
  world settings live (with a recreate-to-apply flow).

**Palworld-specific tooling** (parses the world save's binary GVAS format
directly in Go — no external save-editing tool required)
- **Pal roster**: every captured Pal in the world, with IVs, passives, rank,
  and location, parsed straight out of `Level.sav`.
- **World map**: full in-game map with live player positions, landmark/boss
  locations, and wild spawn points for any species.
- **Breeding calculator**: pick a target species and see every known way to
  breed it — not just the cheapest, the *entire* set of valid parent
  combinations — cross-referenced against what's actually in the world
  already, with wild/boss catch locations for anything you don't have yet.
- **Host resources**: real host-wide CPU/memory/disk, even though the panel
  itself runs in a container.

## Stack

| Layer | Choice |
|---|---|
| Backend | Go — `net/http` (1.22+ method routing), first-party Docker SDK, `coder/websocket`, `modernc.org/sqlite` (pure Go, no CGO) |
| Frontend | React + Vite + TypeScript (`frontend/`), DM Sans + Outfit |
| State | SQLite (WAL, single-writer) |
| Save parsing | Hand-written GVAS property-tree parser + an embedded WASM Oodle decompressor (`wazero`, pure Go — no CGO here either) |
| Runtime | Docker Engine (dev: inside WSL2; prod: any Linux host with Docker) |

## Develop

Prereqs (Linux / WSL2 Ubuntu): Go 1.25+, Docker Engine (daemon running, user
in the `docker` group), Node 20+.

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

## Ship

**Single binary:**

```bash
cd frontend && npm run build     # → frontend/dist
cd .. && go build -o paldeck .   # embeds dist → one file
./paldeck                        # serves UI + API on :8080
```

**Docker** (see `Dockerfile` / `docker-compose.yml`): the panel needs
`/var/run/docker.sock` mounted in to manage sibling containers, and joins the
same Docker network as the servers it creates so it can reach their RCON/REST
ports by container name rather than depending on host networking.

Config via env: `PALDECK_ADDR` (default `:8080`), `PALDECK_DB` (default
`paldeck.db`). Docker connection via the standard `DOCKER_HOST` /
`/var/run/docker.sock`.

## API

22 endpoints under `/api` — servers (create/list/lifecycle/settings/backups),
players (list/kick/ban), pals, map data, breeding, host stats, and a
WebSocket log stream. See `internal/api/` for the full route table; each
handler file is named for what it serves (`players.go`, `pals.go`,
`operator.go`, …).

## Game data & credits

Static Palworld reference data (species, passives, spawn locations,
landmarks, bosses) under `frontend/public/game-data/` is sourced from
[palworld.gg](https://palworld.gg). The breeding combination table
(`breeding.json`) is generated from [PalCalc](https://github.com/tylercamp/palcalc),
which datamines it directly from Palworld's own game files — not a formula,
since real breeding math isn't a simple average of the two parents' stats —
via [beckerfelipee/PalworldBreedingCalculator](https://github.com/beckerfelipee/PalworldBreedingCalculator)
(MIT licensed).

## License

GPL-3.0 — see `LICENSE`.
