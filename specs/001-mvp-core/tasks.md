# Tasks 001 — MVP Core

> The checklist. Each task is small and reviewable (P3). Status is honest (P5):
> a task is only ✅ when built **and observed** working.

Legend: ✅ done · 🟡 in progress · ⬜ todo · ⏸ deferred

---

## Environment

- ✅ **T-000** — WSL Ubuntu dev box, Go 1.26.5, Docker Engine, all no-sudo.
- ✅ **T-001** — Project copied to canonical `~/paldeck` (Linux fs).

## Backend scaffold (code exists, not yet run)

- ✅ **T-002** — `store`: SQLite schema + CRUD + `AllocatePorts`.
- ✅ **T-003** — `docker`: SDK wrapper (Ensure/Create/Start/Stop/Restart/Remove/Status/Logs).
- ✅ **T-004** — `api`: REST routes + create flow + `action` wrapper + helpers.
- ✅ **T-005** — `ws`: WebSocket log streaming.

## Make it real (current focus)

- ✅ **T-006** — First build + run in WSL. `go build ./...` clean, `go run .`
  serves on :8080, console loads. *(Fixed pkg/errors v0.8.1→v0.9.1 — see plan.md.)*
- ✅ **T-007** — **US-1 Create** verified: `paldeck-torta-slayer` container up,
  ports 8211/27015/25575 mapped, volume `paldeck-1bbc97ffb0f2`, DB record. (2026-07-17)
- 🟡 **T-008** — **US-2/US-3**: Start + `running` and Stop + `exited` both
  confirmed correct via Docker *and* API (API mirrors real state). Restart still
  to exercise. NOTE: the embedded page mis-displays this — a throwaway-UI bug,
  not backend (fixed by 002).
- ✅ **T-009** — **US-4 Logs** verified: console streams live (couple-second
  delay while Palworld starts writing). (2026-07-17)
- ⬜ **T-010** — Verify **US-5 Delete**: container removed, world volume kept,
  recreate reuses the world.

## Cleanups (small, from plan.md follow-ups)

- ⬜ **T-011** — Reword `main.go` Docker error text away from "Docker Desktop".
- ⏸ **T-012** — Boot reconciliation via `ManagedIDs()` (adopt/repair). Deferred.
- ⬜ **T-013** — Stop exits `137` (force-kill): Palworld isn't shutting down
  within 30s, so it may skip its save. Investigate proper graceful shutdown
  (longer timeout, or send RCON `Shutdown`/`DoExit` before stop). Real backend
  bug — matters for the product.

## Definition of done for spec 001

All of US-1..US-5 observed (T-007..T-010), build clean, docs current.
