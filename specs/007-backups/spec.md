# Spec 007 — Backups Tab

Status: 🟡 in progress · Depends on: 001–003

## Problem

The server image already snapshots the world hourly into
`.../<worldId>/backup/world/<timestamp>/` (Level.sav + LevelMeta.sav +
Players/), but nothing in Paldeck surfaces them. palworld-gui has a dedicated
Saves tab; ours has none. If a world corrupts or a player wants to undo
something, there's no path back today.

## Approach

No new container capability needed — everything rides the Docker
Copy{From,To}Container APIs already used for Pal Search (T-304). Backup
timestamps are the folder names themselves, so listing needs no exec, no
extra metadata file.

## In scope

- `GET /api/servers/{id}/backups` — list snapshots (timestamp, approx size,
  mod time) by walking the copy-out tar (same technique as ReadWorldLevelSav).
- `POST /api/servers/{id}/backups/{ts}/restore` — stop (no save — restoring
  *over* current state on purpose), copy the chosen backup's files into the
  live world dir (overwrite), leave stopped for the operator to confirm+start.
- Backups tab: list with relative time + size, **Restore** with a strong
  confirm (current state is overwritten, not itself backed up first).

## Out of scope

- Manual/on-demand backup trigger (the image's cron is fixed hourly) — could
  add later via `docker exec` of the image's own backup script.
- Backup pruning/retention UI (the image manages that itself).

## Acceptance

- List shows real backups from a live server, sorted newest first.
- Restore on a stopped server swaps the world; starting after shows the
  restored state (verify via Pals tab pal count or a known change).

## Tasks

- ✅ T-500 backend (2026-07-19): ListBackups (tar-walk via CopyFromContainer,
  regex on `/<worldId>/backup/world/<ts>/Level.sav`, no exec) + RestoreBackup
  (copy-out snapshot dir → re-root tar → copy-in over live world; path-
  traversal guard on worldId/ts) + GET/POST routes. Build+vet clean.
- ✅ T-501 frontend (2026-07-19): Backups tab — relative-time + absolute
  timestamp + size table, Restore w/ strong overwrite-warning confirm,
  status note after restore.
- ✅ T-502 — **live-verified against mew-1's real backups: 19 snapshots
  listed, newest-first, real sizes (~555KB, matches live Level.sav size).**
  (2026-07-19)
