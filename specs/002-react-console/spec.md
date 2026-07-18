# Spec 002 — React Operator Console

> **What & why.** Replaces the throwaway embedded page with the real UI.
> Technical *how* in `plan.md`; checklist in `tasks.md`. Conforms to
> `docs/CONSTITUTION.md`.

Status: 🟡 in progress · Owner: Jon · Depends on: 001 (backend proven working)

---

## Problem

The MVP's embedded vanilla-JS page proved the backend works, but it's a
placeholder: a one-field "create" bar, timer-based re-rendering that wipes the
log console, and unreliable status display. It is not the product and not
portfolio-worthy.

## Goal

The real operator console: a TypeScript + React + Vite app matching the
Catalyst-style dark wireframes — a proper **New Server** flow that collects real
Palworld settings, server **cards** with reliable live status, and a **live log
panel** that never flickers. Ships embedded in the Go binary for prod.

## In scope

- React + Vite + TypeScript frontend, dark operator-console theme.
- **New Server modal** collecting real Palworld settings (not just a name).
- Server **cards**: name, status pill (state-driven, correct), ports, actions
  (Start / Stop / Restart / Delete).
- **Live log console** as its own component — opens a WebSocket, appends lines,
  survives list refreshes (no DOM wipe), auto-scrolls, can be closed.
- Reliable status: reflects what the API returns, updated without destroying
  open log panels.
- Dev proxy (Vite → Go); prod build embedded into the binary.

## Out of scope (later)

- Full Palworld settings editor (all ~50 `PalWorldSettings` keys) — 003+.
- Operator controls: broadcast / schedule / update / monitor — 003.
- Pal search / save parsing — 004.
- Auth / multi-user.

## New Server — MVP fields

Curated subset (the rest deferred to a later full settings editor):

| Field | Type | Default | Maps to |
|-------|------|---------|---------|
| Server name (in-game) | text | — | `SERVER_NAME` |
| Description | text | "" | `SERVER_DESCRIPTION` |
| Max players | number 1–32 | 16 | `PLAYERS` |
| Server password | text (optional) | "" | `SERVER_PASSWORD` |
| Admin password | text (auto if blank) | generated | `ADMIN_PASSWORD` |
| Difficulty | select | None | `DIFFICULTY` |
| PvP | toggle | off | `PVP` (settings) |

Ports stay auto-assigned (not user-set) per the architecture invariant.

## User stories & acceptance criteria

**US-1 — Create with real settings.** Operator opens a modal, fills the fields,
submits; the server is created with those settings applied to the container.
- ✅ Validation inline (name required, players 1–32).
- ✅ Admin password auto-generated when left blank; never shown after create.

**US-2 — Reliable cards & status.** Each server is a card with a correct,
state-driven status pill that updates on a poll **without** disrupting anything
open.

**US-3 — Stable live logs.** Opening a card's console streams logs into a
dedicated panel that keeps its content across background refreshes, auto-scrolls,
and closes cleanly.

**US-4 — Lifecycle from the card.** Start / Stop / Restart / Delete work from the
card with clear feedback; Delete confirms and keeps the world volume.

## Non-functional

- Prod stays a **single Go binary** (built React embedded).
- No secrets rendered to the DOM.
- Matches the dark operator-console palette from the wireframes.

## Done when

US-1..US-4 observed working against the real backend in WSL; `vite build`
output embeds and serves from the Go binary; `go build ./...` clean.
