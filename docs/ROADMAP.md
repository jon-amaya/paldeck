# Paldeck — Roadmap

High-level phases. We only ever have **one** feature spec "in progress" at a
time (see `specs/`). This file says where we are.

| # | Phase | Spec | Status |
|---|-------|------|--------|
| 001 | **MVP core** — create / start / stop / restart / delete servers + live log console | `specs/001-mvp-core/` | 🟢 done (graceful stop = 90s interim; RCON-first shutdown → 003) |
| 002 | **React operator console** — "Ops console" design, tabbed detail, ANSI+timestamped logs, stress-tested, single-binary packaging | `specs/002-react-console/` | 🟢 done (2026-07-18) |
| 003 | Operator controls — broadcast, scheduled restarts, update-on-demand, resource monitor | _not written_ | ⚪ planned |
| 004 | Save parsing → **Pal Search** (the Go showcase piece) | _not written_ | ⚪ planned |
| 005 | Sharing — Caddy reverse proxy + NetBird mesh | _not written_ | ⚪ planned |

Legend: 🟢 done · 🟡 in progress · ⚪ planned

## Current position (2026-07-17)

- Dev environment stood up: WSL Ubuntu + Go 1.26.5 + Docker Engine, all working.
- MVP core code scaffolded (store / docker / api / ws + embedded console).
- **Next concrete step:** first build + run in WSL, then verify the create →
  start → logs → stop loop end-to-end (Task T-006 in 001).
