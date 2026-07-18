# Spec 001 — MVP Core

> **What & why.** The technical *how* is in `plan.md`; the checklist is in
> `tasks.md`. This file is the contract we build against.

Status: 🟡 in progress · Owner: Jon · Conforms to: `docs/CONSTITUTION.md`

---

## Problem

Jon runs Palworld dedicated servers in Docker. Doing it by hand (compose files,
remembering ports, `docker logs -f`, restarts) is tedious and not shareable.
He wants a single web panel to manage servers and *watch them live*.

## Goal

A running Go binary that serves a web console where an operator can spin up a
Palworld server, control its lifecycle, and watch its logs stream in real time —
with all state persisted so it survives restarts.

## In scope (this spec)

- Create a Palworld server (name in → container + ports + persisted record out).
- Start / Stop / Restart a server.
- Delete a server (container removed; **world volume kept**).
- List servers with their **live** status (from Docker, not stale DB state).
- **Live log console** streamed over WebSocket.
- Auto-assigned, non-conflicting ports from a pool.

## Out of scope (later specs)

- React frontend (002) — MVP uses the embedded vanilla-JS console.
- Broadcast / scheduled restarts / update / resource monitor (003).
- Pal search / save parsing (004).
- Remote sharing / reverse proxy (005).
- Auth / multi-user — MVP is single-operator on localhost.

## User stories & acceptance criteria

**US-1 — Create a server.**
As an operator, I type a name and get a ready-to-start server.
- ✅ Name is sanitized (letters, numbers, dash/underscore; spaces → dash).
- ✅ Empty/invalid name → 400 with a helpful message.
- ✅ A unique game/query/rcon port triple is allocated from the pool.
- ✅ The Palworld image is ensured (pulled on first ever create).
- ✅ A container is created with a named volume; the record is persisted.
- ✅ The admin password is generated and **never** sent to the client.

**US-2 — Control lifecycle.**
- ✅ Start / Stop / Restart act on the right container.
- ✅ Stop is graceful (~30s) so Palworld saves before exit.
- ✅ Acting on a missing server → 404.

**US-3 — See true status.**
- ✅ Listing shows each server's real Docker state (running/exited/created/absent),
  read at request time.

**US-4 — Watch logs live.**
- ✅ Opening a server's console upgrades to a WebSocket and streams new log
  lines as they happen.
- ✅ If the server isn't started, the console says so rather than hanging.

**US-5 — Delete safely.**
- ✅ Deleting removes the container but **keeps** the world volume.
- ✅ The DB record is removed.

## Non-functional

- Single self-contained binary (web assets embedded).
- No CGO / C toolchain required to build.
- Runs non-root; talks to Docker Engine over its socket.

## Done when

All ✅ above are observed working against real Docker in WSL, `go build ./...`
is clean, and the create → start → logs → stop → delete loop is demonstrated end
to end.
