# Spec 006 — World Settings Editor

Status: 🟡 in progress · Depends on: 001–003

## Problem

Paldeck collects 6 settings at create and freezes them ("settings are fixed at
creation"). palworld-gui exposes 80+ world options; operators expect to tune
rates, penalties, and toggles after a server exists.

## Approach (fits the architecture)

The image compiles PalWorldSettings.ini **from env vars on every boot**, and
worlds live on named volumes that survive container recreation. So editing =
store settings in the DB → **recreate the container** with new env on the same
volume + ports → start. World untouched; every option applies.

## In scope

- Extended settings stored per server (JSON column) + editable base fields
  (description, max players, difficulty, PvP, join password).
- Settings tab becomes an **editable, categorized form** (~28 high-value
  options: rates, day/night, death penalty, base camp limits, toggles).
- **Save** (persist) and **Apply & restart** (graceful save-stop → remove
  container, volume kept → create with new env, same ports → start if it was
  running). Clear "restart required" indication.

## Out of scope

- Raw .ini editing; engine tuning tab; the remaining ~50 exotic options
  (added later behind the same mechanism).

## Acceptance

- Change a visible option (e.g. EXP_RATE 1→3), Apply, and observe it in-game /
  in the compiled PalWorldSettings.ini inside the container.
- Recreate keeps: world, ports, admin password, REST plumbing.
- Env names validated against the running container after first apply
  (`docker inspect` env + compiled ini) — record results in tasks.md.

## Tasks

- ✅ T-400 backend (2026-07-19): `world_settings` JSON column + migration +
  UpdateSettings; docker CreateOpts.Extra env; GET/PUT
  /api/servers/{id}/settings (PUT: 41-key env allowlist, pointer fields =
  partial update, password null=keep); POST /api/servers/{id}/recreate
  (REST save → stop → remove [volume kept] → create same ports/volume/admin-
  pass + new env → start if was running). Build+vet clean.
- ✅ T-401 frontend (2026-07-19): WorldSettingsPanel — General (desc/players/
  difficulty/pvp/join-password keep-semantics) + 6 categories × 41 options,
  defaults as placeholders (empty = game default), dirty tracking, Save +
  Apply & restart w/ confirm. Allowlist rejection verified via curl (400).
- ⬜ T-402 live verification (ini inside container + in-game effect).
