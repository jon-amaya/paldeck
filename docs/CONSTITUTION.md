# Paldeck — Project Constitution

> The non-negotiable rules of this project. Every spec, plan, and change must
> conform to this document. If something here is wrong or outdated, we change
> *this file first*, deliberately — not in passing.

Version: 1.0 · Adopted: 2026-07-17

---

## 1. What Paldeck is

A self-hostable **Palworld dedicated-server control panel**. One operator can
create, run, and monitor multiple Palworld servers from a dark "operator
console" web UI, each server isolated in its own Docker container, with a live
log stream. Later: Palworld-specific tooling (Pal search, breeding/IV helpers,
map). Built to be a **portfolio-quality, finished, deployed, shareable** project.

## 2. Working principles (how we build)

These govern collaboration between Jon and the assistant.

- **P1 — Learn, don't vibe-code.** No black-box generated code. Every change is
  explained in plain terms *before or as* it lands. Jon understands each piece;
  if he doesn't, we stop and explain, not push forward.
- **P2 — Spec before code.** No non-trivial work happens without a `spec.md`
  and a task in `tasks.md`. Scope creep gets written down as a new task, not
  silently built.
- **P3 — Small, reviewable steps.** One logical change at a time. Prefer a
  working slice over a big unreviewed batch.
- **P4 — Verify, don't assume.** Re-read a file before editing it. Confirm
  library/API names against the actual installed version — never invent method
  signatures. A build or a run is the proof, not a claim.
- **P5 — Honest status.** "Done" means built and observed working. Skipped or
  failing steps are stated plainly.

## 3. Anti-hallucination guardrails (assistant MUST follow)

- Re-read the target file with a Read/view before every edit.
- Before using a third-party API (Docker SDK, websocket, sqlite driver), verify
  the symbol exists in the version pinned in `go.mod`. If unsure, check the
  installed source under `~/go/pkg/mod`, don't guess.
- Never introduce a dependency without recording it in the relevant `plan.md`.
- Match the surrounding code's style, naming, and comment density.
- When a decision isn't covered here, ask — don't invent a direction.

## 4. Technology decisions (LOCKED)

Changing any of these requires editing this section on purpose.

| Layer | Choice | Notes |
|-------|--------|-------|
| Backend language | **Go** | Chosen over Rust for velocity + readability. |
| HTTP | `net/http` std lib, **1.22+ method routing** | No web framework. |
| Docker access | **first-party Docker SDK** (`github.com/docker/docker/client`) | Client talks to `dockerd`. No shelling out to the `docker` CLI. |
| Live logs | **`coder/websocket`** | Streams container logs to the browser. |
| Database | **SQLite** via `modernc.org/sqlite` | Pure-Go driver, **no CGO** / C compiler. |
| Frontend (next) | **TypeScript + React + Vite** | Replaces the embedded vanilla-JS console. |
| Container runtime | **Docker Engine** | NOT Docker Desktop, NOT raw containerd. Matches prod VM. |
| Server image | **`thijsvanloef/palworld-server-docker`** | Proven image; one container per Palworld server. |
| Sharing / ingress | **Caddy + NetBird** | Reverse proxy + private mesh for remote access. |

## 5. Architecture invariants

- **One container per Palworld server.** No multi-server-per-container.
- **Ports auto-assigned from a pool.** game 8211+, query 27015+offset,
  rcon 25575+offset. A server's three ports share one offset for readability.
- **Worlds survive delete/recreate.** Each server owns a named Docker volume
  (`paldeck-<id>`) mounted at `/palworld`. Deleting a server keeps its volume.
- **Non-root.** Containers run the game as an unprivileged user (PUID/PGID 1000).
- **No telemetry, no phone-home, English-only.** (Reaction to the forked GUI.)
- **The backend is a Docker *client*.** It never assumes it *is* the daemon;
  `dockerd` runs separately (locally: inside WSL; prod: the VM).

## 6. Environments

- **Dev:** WSL2 Ubuntu ("mew"). Go + Docker Engine installed *inside* WSL.
  Canonical source lives at `~/paldeck` on the Linux filesystem (never `/mnt/c`).
- **Prod:** Jon's Linux Docker VM. Same Docker Engine model, so dev↔prod parity
  is high. A live Palworld server already runs there — **never touch it**;
  test with throwaway worlds on non-conflicting ports.

## 7. Definition of Done (per feature)

1. Meets the acceptance criteria in its `spec.md`.
2. `go build ./...` is clean.
3. The behavior was *run and observed*, not just compiled.
4. Docs/tasks updated to reflect reality.
