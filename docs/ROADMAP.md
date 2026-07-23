# Paldeck — Roadmap

High-level phases. We only ever have **one** feature spec "in progress" at a
time (see `specs/`). This file says where we are.

| # | Phase | Spec | Status |
|---|-------|------|--------|
| 001 | **MVP core** — create / start / stop / restart / delete servers + live log console | `specs/001-mvp-core/` | 🟢 done (graceful stop = 90s interim; RCON-first shutdown → 003) |
| 002 | **React operator console** — "Ops console" design, tabbed detail, ANSI+timestamped logs, stress-tested, single-binary packaging | `specs/002-react-console/` | 🟢 done (2026-07-18) |
| 003 | **Operator controls** — live metrics, players (kick/ban), broadcast, save-before-stop | `specs/003-operator-controls/` | 🟢 done (2026-07-18, verified live in-game) |
| 004 | Save parsing → **Pal Search** — WASM Oodle decompressor, GVAS/property-tree parser, live in the Pals + Map tabs | `specs/004-pal-search/` | 🟢 done (2026-07-19, live-verified against real world) |
| 005 | Sharing — admin-only panel access via Jon's existing self-hosted NetBird | `specs/005-sharing/` | 🟡 in progress — spec + plan written, Caddy dropped (constitution v1.1), next: `netbird-client` sidecar |
| 006 | **World settings editor** — categorized form for 41 image options, apply-via-recreate | `specs/006-world-settings/` | 🟢 done (2026-07-19) |
| 007 | **Backups tab** — list/restore the image's hourly world snapshots | `specs/007-backups/` | 🟢 done (2026-07-19, live-verified: 19 real backups) |
| 008 | Guilds tab | `specs/008-guilds/` | 🔴 **blocked** — guild binary format has drifted from the public reference decoder; needs a real multiplayer-guild save to resume (see spec for details) |
| 009 | **RCON command console** — Source RCON client, quick commands + free-form, loopback hardening | `specs/009-rcon-console/` | 🟢 done (2026-07-19, live-verified against mew-1) |

Legend: 🟢 done · 🟡 in progress · ⚪ planned · 🔴 blocked

## Current position (2026-07-23)

MVP through backups, guild search, and RCON are done and live-verified
against real servers/worlds. Guilds is blocked on missing reference data
(see 008). Now on **005 — sharing**: turned out much smaller than first
scoped — Jon already runs self-hosted NetBird for his OG Palworld stack,
and Paldeck's own server-creation code already exposes game ports
publicly (verified in `docker.go`) exactly like that OG server does. The
only remaining piece is putting the Paldeck *panel* itself on that
existing mesh via a `netbird-client` sidecar, same pattern as every other
stack on that account. Caddy is dropped from the stack — constitution
amended to v1.1 (§4: "Self-hosted NetBird") since Jon's actual working
pattern already uses NetBird's own dashboard reverse-proxy + Traefik (see
`specs/005-sharing/plan.md`). Remaining ground after 005: breeding
calculator (needs an external dataset).
