# Plan 003 — Operator Controls (technical)

> Implements `spec.md`. Verified-API-notes section is the anti-hallucination
> record (constitution P4).

---

## Data planes

| Source | Gives | Works for |
|---|---|---|
| Docker `ContainerStats` + `ContainerInspect` | CPU %, memory used/limit, StartedAt (uptime) | **all** servers, running |
| Palworld REST API (`:REST_API_PORT`, Basic auth `admin:{ADMIN_PASSWORD}`) | players online/max, version, in-game day, FPS, player list, kick/ban, announce, save | servers created **with 003 plumbing** (host-mapped REST port) |

## New pieces

```
internal/palworld/palworld.go   REST client (Basic auth, 3s timeout)
internal/docker/docker.go       + Stats(), StartedAt() 
internal/store/store.go         + rest_port column (migration), reserved in CreateReserving
internal/api/api.go             + GET  /api/servers/{id}/metrics
                                + GET  /api/servers/{id}/players
                                + POST /api/servers/{id}/broadcast {message}
                                + POST /api/servers/{id}/players/{pid}/kick | /ban
                                Stop handler: REST save → then container stop
frontend                        Overview tiles wired to /metrics poll (5s while
                                open); Players tab live; Broadcast dialog
```

## Port scheme (extends the invariant)

REST host port = **8212 + offset** (offset = game-8211), TCP, bound to
**127.0.0.1** only. Note: rest N and game N+1 can share a number (8213/tcp
loopback vs 8213/udp public) — different protocol + interface, no conflict.
Inside the container REST always runs on 8212 (image default).

Existing pre-003 servers have `rest_port = 0` → REST-derived metrics show "—";
recreating the server upgrades it. Docker-derived metrics work regardless.

## CPU% calculation (Linux, cgroups)

`ContainerStats(ctx, id, stream=false)` returns one sample with `PreCPUStats`
populated. CPU% = (Δ TotalUsage / Δ SystemUsage) × OnlineCPUs × 100.

## Verified API notes (P4)

- Docker SDK v27.3.1: `ContainerStats(ctx, id, stream bool) (container.StatsResponseReader, error)`;
  decode `Body` into `container.StatsResponse` (fields: `CPUStats`,
  `PreCPUStats`, `MemoryStats.Usage/Limit`). Verified in the installed module
  source (2026-07-18).
- Image env (thijsvanloef README, fetched 2026-07-18): `REST_API_ENABLED`
  (default **true**) and `REST_API_PORT` (default 8212). RCON_ENABLED noted as
  "required for docker stop to save" — we already set it true.
- Palworld REST endpoints (official dedicated-server API): `GET /v1/api/info`,
  `GET /v1/api/metrics`, `GET /v1/api/players`, `POST /v1/api/announce`,
  `POST /v1/api/kick`, `POST /v1/api/ban`, `POST /v1/api/save` — Basic auth
  user `admin`, password = ADMIN_PASSWORD. Response field names confirmed
  against a live server 2026-07-18 (structs correct as written).
- **World→map coordinate transform** (two standing-player calibration pairs,
  2026-07-18): **axes swapped**, game **rounds** —
  `map_x = round((world_y − 157829) / 459.317)`,
  `map_y = round((world_x + 123490) / 459.317)`.
  Pairs: world (−355475.34, 265503.63) ↔ map (234, −505) and
  world (−352660.22, 266500.63) ↔ map (237, −499); all four axes exact.
  Offsets are centered within their feasible ranges (x: 157790–157868,
  y: 123291–123690) — integer map display leaves ±½-unit slack; a far-away
  third pair would tighten them further if the Map tab ever needs it.
  (Methodology: never calibrate against a moving player; community constants
  157935/123888 were each ~100–400 units off.)

## Dependencies

None new — std lib `net/http` client for the REST calls.
