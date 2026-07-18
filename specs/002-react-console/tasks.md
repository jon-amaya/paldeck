# Tasks 002 — React Operator Console

Legend: ✅ done · 🟡 in progress · ⬜ todo · ⏸ deferred

---

## Toolchain

- ✅ **T-100** — Node via nvm: node v24.18.0 / npm 11.16.0 (no sudo). (2026-07-17)

## Scaffold

- ✅ **T-101** — Vite React+TS app scaffolded under `frontend/`. (2026-07-17)
- ✅ **T-102** — `vite.config.ts` proxy: `/api` → :8080, `ws: true`. *(verify in browser)*
- ✅ **T-103** — Dark theme (`theme.css`) + app shell (header + create bar +
  empty state), palette from the wireframes.

## Wire to the backend (read paths first)

- ✅ **T-104** — `types.ts` (`Server`) + `api.ts` (typed fetch wrappers).
- ✅ **T-105** — `ServerCard.tsx`: status pill, ports, actions.
- ✅ **T-106** — `App.tsx` polls the list every 5s; cards re-render **without**
  unmounting an open LogConsole.

## The two things the vanilla page did badly

- ✅ **T-107** — `LogConsole.tsx`: component owns its WebSocket + lines, survives
  refreshes, auto-scrolls, caps at 1000 lines. (Fixes the 001 flicker — US-3.) *(verify)*
- ✅ **T-108** — Card actions: Start / Stop / Restart / Delete + confirm. (US-4.) *(verify)*

## The real create flow (frontend + backend together)

- ✅ **T-109** — Backend extended: `store` columns + idempotent migration,
  `docker` env (verified names: `SERVER_DESCRIPTION`, `PLAYERS`,
  `SERVER_PASSWORD`, `DIFFICULTY` [None|Normal|Difficult], `IS_PVP`), `api`
  create validates + threads settings. Build OK. (2026-07-17)
- ✅ **T-110** — `NewServerModal.tsx`: create form wired to the extended API.
  **US-1 VERIFIED**: created `test` via modal → ports stepped to 8212/27016/25576,
  container env confirmed `IS_PVP=true`, `PLAYERS=16`, `DIFFICULTY=None`,
  auto-gen `ADMIN_PASSWORD`. Settings land on the real container. (2026-07-17)

## Polish the UI (before packaging — Jon's call)

- ✅ **T-112** — Cards surface settings: chips for players/difficulty/PvP (PvP
  chip reddens when on) + description line. (2026-07-17) *(verify)*
- ✅ **T-113** — Create success dialog: POST response now returns `adminPassword`
  once (list/get never do — verified via curl probe, HTTP 201), and the UI shows
  a "{name} is ready" dialog with ports + one-time password + Copy button.
  Delete-keeps-volume also re-verified via the probe. (2026-07-17) *(verify UI)*
- ✅ **T-114** — Log console header: name, live connection dot, line count,
  Clear button; friendlier connecting/empty states. (2026-07-17) *(verify)*
- ✅ **T-115** — Action feedback: per-server pending state — spinner on the
  clicked button, all actions locked while in flight, pill flips to amber
  pulsing "stopping…/starting…/restarting…/deleting…" until Docker resolves
  (Stop ≈ 30s). Start/Stop disabled when not applicable. (2026-07-17) *(verify)*
- ✅ **T-118** — Tabbed operator shell (Jon: the wireframe structure): cards →
  Manage → detail view with header actions + tabs Overview | Console | Players |
  Settings. Console mounts on open and survives tab switches (hidden, not
  unmounted). Players = labeled 003 placeholder; Settings = read-only config +
  danger-zone Delete. State-based nav, no router lib. (2026-07-17) *(verify)*
- ✅ **T-119** — Full redesign to "Ops console" (direction A, Jon-approved via
  3-way mockup artifact): dark slate + indigo, Inter UI font, left sidebar
  (dino logo, vector icons, live server sub-list, docker footer), server table
  replaces cards, underline tabs, dense Overview tiles (live metrics tiles
  greyed "—" until 003). Committed dark-only. (2026-07-17) *(verify)*
- ✅ **T-120** — Console ANSI rendering (Jon: "format the logs better"): parse
  SGR escape codes (reset/bold/30-37/90-97) into colored spans mapped to the
  console palette; handle \r progress overwrites; strip non-color escapes.
  Parsed once on arrival (stored as segments), not per render. (2026-07-18) *(verify)*
- ✅ **T-121** — Console timestamps: `Timestamps: true` on ContainerLogs (real
  daemon-side emit times, valid for backlog too); frontend peels the RFC3339Nano
  prefix and renders a dim tabular HH:MM:SS gutter (local time, non-selectable).
  (2026-07-18) *(verify)*
- ✅ **T-116** — Small-screen pass: mobile top bar (logo + running status)
  replaces the hidden sidebar under 860px; detail regained a back button
  (was unreachable on mobile — real bug); tabs scroll horizontally; table
  already scrolls in its wrap. (2026-07-18)

## Stress test (before packaging — Jon's call)

- ✅ **T-117** — Stress run (2026-07-18). Findings & outcomes:
  - **A · hostile inputs:** all held — bad JSON/empty name → 400; XSS/traversal
    name sanitized; 60-char name truncated to 40; players 999→32, -5→1;
    difficulty "banana"→None.
  - **B · 5 concurrent creates:** FOUND 2 REAL BUGS —
    (1) **port-collision race**: two servers both allocated 8217 (SELECT-then-
    insert-later TOCTOU). Fixed: `store.CreateReserving` reserves ports +
    inserts the row in one transaction; create flow reordered to DB-first,
    container-second, row deleted on container failure.
    (2) **SQLITE_BUSY**: 3/5 creates failed "database is locked". Fixed: WAL +
    busy_timeout(5000) pragmas + `SetMaxOpenConns(1)`.
    Re-run after fixes: **5/5 created, all ports unique.**
  - **C · conflict storm** (concurrent stop+restart+start on a running server):
    Docker serialized, no crash/wedge, API and Docker state agree after settle
    and after final stop.
  - Re-confirmed: graceful Stop exits **137** (Palworld not down within 30s) —
    raises priority of **T-013** (RCON save/shutdown before stop).

## Ship it as one binary (AFTER polish + stress)

- ✅ **T-111** — Packaged: `npm run build` → `frontend/dist` (65KB gz JS,
  per-script font subsets); `main.go` embeds `all:frontend/dist`; old `web/`
  placeholder deleted; T-011 error text fixed alongside. Verified: `./paldeck`
  (19MB) serves the React app, hashed assets, and the API from one file.
  (2026-07-18)
- ✅ **T-013 interim** — Stop/Restart grace 30s→90s (image saves world on
  SIGTERM but needs longer than 30s; killed exit-137). Full RCON-first shutdown
  still tracked in 001/003. (2026-07-18)

## Definition of done for spec 002

US-1..US-4 observed; UI polished (T-112..T-116) and stress-tested (T-117); then
built SPA embeds and serves from the Go binary; build clean.

**✅ SPEC 002 COMPLETE (2026-07-18).**
