# Spec 005 — Sharing (self-hosted NetBird for admin access)

> **What & why.** Jon reaches the Paldeck panel remotely without exposing it
> to the public internet, using NetBird infrastructure he already runs.
> Conforms to `docs/CONSTITUTION.md`. How: `plan.md`.

Status: 🟡 in progress · Depends on: 001–003

---

## Problem

The Paldeck panel listens on `:8080` on all interfaces (`main.go:28`) —
reachable on the LAN today, but reaching it remotely means either exposing
an **unauthenticated admin panel** to the public internet, or not being
able to administer servers away from home at all.

## Decisions (Jon, 2026-07-23)

- **NetBird already exists** — self-hosted at `https://fsocietyunraid.xyz`,
  already used to reach Jon's Unraid box for the "OG" Palworld stack. This
  spec integrates Paldeck with that existing network; it does not stand up
  anything new.
- **Player-facing game ports stay exactly as they are.** Confirmed in
  `internal/docker/docker.go`: every Paldeck-created server already binds
  `GamePort`/`QueryPort` to `0.0.0.0` (public — friends connect directly,
  same as the OG server) while `RconPort`/`RestPort` stay `127.0.0.1`
  (admin-only). **No code change here — this already matches the OG
  pattern.** NetBird is not involved in player access at all.
- **NetBird's job is admin-only**: get Jon's own devices onto the same
  mesh his Unraid box is already on, so the panel is reachable without a
  public port. Jon's existing per-stack pattern is a `netbird-client`
  sidecar container (`network_mode: host`, `NET_ADMIN`/`SYS_ADMIN`/
  `SYS_RESOURCE`, `/dev/net/tun`) pointed at his management URL, plus a
  "reverse proxy service" entry + Traefik port config he sets up by hand
  in the NetBird dashboard — both verified as his actual working pattern
  from the OG stack's compose file, not guessed.

## Approach

Add a `netbird-client` sidecar to wherever Paldeck's binary runs (host
networking, so it shares the host's network namespace the same way the OG
stack's sidecar does — see `plan.md` for the concrete compose block). Once
that host is enrolled as a peer, the panel at `:8080` is reachable at the
peer's mesh IP with zero Paldeck code changes (already confirmed to bind
all interfaces, not loopback). The NetBird-dashboard-side reverse-proxy +
Traefik step is operational, done by Jon in the dashboard — not something
Paldeck ships or automates in v1.

## In scope

- `netbird-client` sidecar compose block for Paldeck's deployment host,
  mirroring the OG stack's exact pattern (see `plan.md`).
- Documentation of the operational NetBird-dashboard steps (reverse-proxy
  service + Traefik port) as a runbook, since that's config Jon holds, not
  code in this repo.

## Out of scope

- Any change to how Paldeck creates/exposes Palworld servers — already
  correct, verified by reading `docker.go` directly.
- NetBird groups/access policies scoped to "players" — moot now that
  players never touch the mesh. If Jon later wants finer-grained control
  over which of *his own* devices can reach the panel, that's a small,
  separate addition to make on the existing account, not a Paldeck feature.
- Caddy. **Resolved (Jon, 2026-07-23): dropped.** `CONSTITUTION.md` §4
  amended to "Self-hosted NetBird" — Jon's existing dashboard reverse-proxy
  + Traefik pattern already covers ingress; no Caddy anywhere in this repo.
- Containerizing Paldeck itself — it stays the single Go binary
  (ROADMAP 002), run directly on the host; only the NetBird client needs
  to be a container (that's how NetBird ships).

## Acceptance

- Jon enrolls a second device (e.g. phone) via the existing NetBird
  network and reaches the Paldeck panel through it — verified live, not
  assumed from the sidecar's presence in the compose file.
- The panel is confirmed **not** reachable at the host's raw public IP
  (only via the mesh) — checked directly, not inferred from intent.
- The live OG Palworld server and its existing NetBird enrollment are
  untouched throughout.

## Progress

- ✅ **T-001 port-pool collision with unmanaged containers** (Jon: "how will
  the dashboard know which ports are free" — asked while planning the move
  to the Proxmox host, which already runs the OG server on Paldeck's exact
  default ports 8211/27015). Read `store.CreateReserving` and confirmed the
  gap directly: it only checked ports already recorded in *Paldeck's own*
  SQLite table — a manually-run container Paldeck never created was
  invisible to it, so the very first server created on that host would
  have tried to claim 8211/udp and collided with the OG server.
  - Added `docker.UsedHostPorts` — lists every host port published by *any*
    container (not just `paldeck.managed=true` ones), split by protocol
    (verified against the pinned SDK's real `types.Port{PublicPort,
    Type}` struct, not assumed) since tcp/udp are independent kernel port
    namespaces — that's also why the REST port can already validly share a
    number with a neighbor's game port (pre-existing comment in the code).
  - `CreateReserving` now checks all four derived ports (game/query udp,
    rcon/rest tcp) against live Docker state, not just the game port —
    the old code only ever checked `used[game]`, which happened to be
    sufficient for Paldeck's own servers (they all shift in lockstep) but
    not for an external container with an unrelated port layout.
  - Fetching live Docker state is best-effort in the handler: if it fails,
    creation proceeds on Paldeck's own records alone rather than hard-
    blocking (the container-create step still fails safely on a real
    collision).
  - **Honest limit**: this WSL dev environment has no unmanaged
    Palworld-like container to test the actual collision-avoidance path
    against — verified via clean `go build`/`go vet` and direct inspection
    of the pinned Docker SDK's types, plus a live regression check (
    existing `mew-1` server still lists correctly after the change). The
    real test is once this runs alongside the OG server on Proxmox.
  - Also fixed while in the area: the backend still hard-capped max players
    at 32 in both the create and settings-update handlers (`api.go`,
    `settings.go`) — the frontend cap was raised to the real 99 limit
    earlier this session but the backend silently clamped anything above
    32 back down, an inconsistency that would've silently undershot a
    user's actual setting. Fixed both to 99.
