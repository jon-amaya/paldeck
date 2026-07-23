# Tasks 003 — Operator Controls

Legend: ✅ done · 🟡 in progress · ⬜ todo · ⏸ deferred

---

## Backend plumbing

- ✅ **T-200** — `rest_port`: store column + migration; reserved (8212+offset)
  in `CreateReserving`; docker env `REST_API_ENABLED/PORT` + **127.0.0.1-only**
  binding (container-internal always 8212). Build clean. (2026-07-18)
- ✅ **T-201** — `internal/palworld`: REST client (Basic auth, 3s timeout):
  Info, Metrics, Players, Announce, Kick, Ban, Save. Build clean. (2026-07-18)
- ✅ **T-202** — docker: `Stats()` (docker-CLI CPU% formula, inactive_file mem
  correction) + `StartedAt()`. SDK fields verified in module source. (2026-07-18)
- ✅ **T-203** — API routes **live-verified** against fresh server `mew-1`
  (2026-07-18): REST bound 127.0.0.1-only confirmed via inspect; `/metrics`
  returned all fields (cpu 15.6%, fps 59, players 0/8, mem 1.6/16.5GB, version
  v1.0.1.100619) — Palworld field names correct as written; `/players` shape ok;
  broadcast `sent`; save-before-stop works. NOTE: container still exits 137
  after save — data is safe (explicit save first), cosmetic investigation left.

## Frontend (built 2026-07-18, verify in browser)

- ✅ **T-204** — Overview tiles live: 5s `/metrics` poll while detail open;
  "—" degradation; pre-003 recreate note; new Version/Day/FPS tiles.
- ✅ **T-205** — Players tab: polled list (name/level/ping/location) with
  Kick/Ban + confirm; unavailable + nobody-online states.
- ✅ **T-206** — Broadcast dialog from the detail header (disabled unless
  running + REST available).


## Definition of done

US-1..US-4 of `spec.md` observed against a real running server.

**✅ SPEC 003 COMPLETE (2026-07-18).** All four verified live with Jon in-game
on `mew-1`: US-1 tiles streaming (CPU/mem/FPS/uptime/version/day), US-2 Jon
("gleesh") in the Players tab with level/ping/**calibrated map location**
(two-point standing calibration, axes swapped, game rounds), US-3 broadcast
received in-game ("broadcast works :D"), US-4 save-before-stop script-verified.
Follow-ups parked: exit-137 cosmetics; console "— earlier logs —" divider;
optional far-point scale check for the future Map tab.
