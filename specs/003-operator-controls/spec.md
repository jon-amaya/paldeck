# Spec 003 — Operator Controls

> **What & why.** Turn the console from lifecycle-only into a real operator
> tool: live metrics, player management, broadcast. Conforms to
> `docs/CONSTITUTION.md`. How: `plan.md` · checklist: `tasks.md`.

Status: 🟡 in progress · Depends on: 002 (console shell, greyed metric tiles)

---

## Problem

The console can start/stop servers and stream logs, but the operator is blind:
no player count, no resource usage, no way to talk to players. The Overview
tiles for Players/Uptime/CPU/Memory literally show "—", and the Players tab is
a placeholder.

## Goal

Fill the blanks with live data and add the first two operator actions —
broadcast a message, and manage players — using the two data planes every
Palworld server already has: the **Palworld REST API** (:8212, Basic auth) and
**Docker** (stats/inspect).

## In scope

- **Live metrics** on Overview: players online / max, uptime, CPU %, memory,
  server version, in-game day, FPS — polled while the detail view is open.
- **Players tab**: live list (name, level, ping) with **Kick** / **Ban**.
- **Broadcast**: send an announcement to the server from the detail header.
- **REST API plumbing**: new servers get a host-mapped REST port
  (127.0.0.1-only) and the env to enable it; servers created before 003 show
  metrics from Docker only, with a note to recreate for full metrics.
- **Save-before-stop**: trigger a world save via REST before graceful stop
  (closes T-013 properly).

## Out of scope (later)

- Scheduled restarts / update-on-demand (later in 003 or 004 era).
- Historical graphs — MVP is current values.
- Editing world settings (its own spec).
- Pal search (004), sharing (005).

## User stories & acceptance criteria

**US-1 — See the server live.** Overview tiles show real values within ~5s of
opening the detail, refreshing continuously; a stopped server shows "—" without
errors.

**US-2 — Manage players.** Players tab lists online players (name, level,
ping); Kick and Ban act on the chosen player and confirm; empty state when
nobody's online.

**US-3 — Broadcast.** Operator types a message, it appears in-game to all
players; UI confirms send.

**US-4 — Worlds save on stop.** Stop triggers a REST save first, then the
graceful container stop; no more exit-137 data-loss window on healthy servers.

## Non-functional

- REST ports bound to **127.0.0.1 only** — the panel proxies; the admin API is
  never exposed to the LAN.
- Backend never trusts Palworld API availability: every call has a short
  timeout and the UI degrades to "—".
- Admin password stays server-side (json:"-" unchanged); the browser never
  sees it — the Go backend makes the REST calls.

## Done when

US-1..US-4 observed against a real running server; build clean; docs current.
