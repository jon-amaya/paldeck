# Spec 004 — Pal Search (save parsing)

> **What & why.** Parse the server's world save in Go and surface every
> captured Pal — the showcase feature no basic panel has. Conforms to
> `docs/CONSTITUTION.md`. How: `plan.md` · checklist: `tasks.md`.

Status: 🟡 in progress · Depends on: 001–003

---

## Problem

Everything about a world's Pals — who caught what, levels, IVs (Talent
values), genders, passives — is locked inside `Level.sav`, an Unreal GVAS
binary. Operators can't answer "who has a good Anubis?" without third-party
desktop tools.

## Goal

A **Pals tab** in the sidebar: pick a server, get a searchable, sortable table
of every captured Pal in its world — species, nickname, level, gender, the four
Talent/IV values, passive skills, and owner — parsed server-side in pure Go.

## In scope

- Read `Level.sav` from a server's Docker volume (works for running *and*
  stopped servers; trigger a REST save first when running, for freshness).
- Go decoder: Palworld compression wrapper → GVAS → property tree →
  `CharacterSaveParameterMap` → per-character parameters.
- `GET /api/servers/{id}/pals` — parsed list, cached until the save changes.
- Pals tab UI: search (species/nickname/owner), sort (level, IVs), gender and
  passive display.

## Out of scope (later)

- Breeding calculator / IV planner (needs species stat tables — later).
- Editing saves (read-only, always).
- Map tab, sharing (005).

## User stories & acceptance criteria

**US-1 — See the Pals.** Operator opens the Pals tab for a server and gets the
full list of captured Pals for that world with species, level, gender, talents,
and owner — including Pals in boxes, not just parties.

**US-2 — Find a Pal.** Type "anubis" → instant filter; click a column → sort;
"show only owned by X" works.

**US-3 — Fresh data.** For a running server the list reflects the world as of
moments ago (save-then-parse); a stopped server parses its last save. Parse
failures degrade to a clear error, never a crash.

## Non-functional

- Pure Go (no CGO, no Python sidecar) — constitution stack invariant.
- Parsing a multi-MB save must not block the server list/console (do it on
  demand, cache by file mtime/hash).
- Read-only: the panel never writes into the volume.

## Done when

US-1..US-3 observed against a real world with captured Pals; build clean;
format findings recorded in plan.md as they're verified.
