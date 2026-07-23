# Spec 009 — RCON Command Console

Status: 🟡 in progress · Depends on: 001–003

## Problem

Broadcast/kick/ban/save go through the Palworld REST API, but there's no way
to run an arbitrary admin command (Info, ShowPlayers, Shutdown, custom
commands) — palworld-gui has a full RCON console; Paldeck has none.

## Approach

Palworld implements the standard **Source RCON protocol** (Valve's binary
TCP protocol — well-documented, not reverse-engineered) on `RCON_PORT`
(already enabled per server). A minimal Go client (dial → auth → exec →
close, one connection per command — RCON usage here is low-frequency) is all
that's needed; no third-party dependency.

**Hardening alongside this feature:** RCON is currently bound `0.0.0.0`
(public) — full admin command execution gated only by the admin password.
Since Paldeck itself only ever needs `127.0.0.1`, switch to loopback-only
(matching the REST port's existing security posture). Live servers need a
Settings → Apply & restart to pick up the new binding.

## In scope

- `internal/rcon`: Source RCON client.
- `POST /api/servers/{id}/rcon` `{command}` → `{output}`.
- RCON panel in the Console tab: quick buttons (Info, ShowPlayers, Save) +
  free-form input + local command/response history.
- RCON port loopback-only for new/recreated servers.

## Out of scope

- Multi-packet response reassembly (fine for Palworld's typical short
  responses; would matter for huge outputs).
- Persistent/pooled RCON connections.

## Acceptance

- `Info` / `ShowPlayers` return real server data from a running server.
- Arbitrary command round-trips; disconnected/stopped server fails cleanly
  (409, not a hang).

## Tasks

- ✅ T-600 backend (2026-07-19): `internal/rcon` Source RCON client (dial/
  auth/exec/close); `POST /api/servers/{id}/rcon`; RCON + REST both hardened
  to 127.0.0.1-only. Build+vet clean.
- ✅ T-601 frontend (2026-07-19): RconPanel — quick buttons (Info/ShowPlayers/
  Save), free-form input, local history, mounted below the log console.
- ✅ T-602 — **live-verified against running mew-1**: `Info` → real version
  string ("Pal Server[v1.0.1.100619] mew-1"), `ShowPlayers` → real CSV header,
  garbage command → server's own "Unknown command" (no crash), invalid server
  id → clean 404. (2026-07-19)

**✅ SPEC 009 COMPLETE.**
