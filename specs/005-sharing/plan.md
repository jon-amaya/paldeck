# Plan 005 — Sharing (technical)

> Implements `spec.md`. Records **verified findings** — from Jon's actual
> running OG stack (2026-07-23) and from reading Paldeck's own source, not
> from NetBird's general docs. The earlier draft of this plan researched
> NetBird's docs cold and assumed a from-scratch deployment; that draft was
> wrong about the starting state and is superseded by this one.

---

## Verified findings

**From Paldeck's own source (`internal/docker/docker.go:80-128`):**
Game/query ports already bind `0.0.0.0` (public); RCON/REST already bind
`127.0.0.1` (loopback, from spec 009's hardening pass). This is exactly
the OG server's own exposure pattern. Nothing to change here.

**From Paldeck's own source (`main.go:28`):** the panel's HTTP server
binds `:8080` — all interfaces, not loopback. So it's already reachable
from anywhere that can route to the host, including a NetBird peer
interface, with no listen-address change needed.

**From Jon's actual OG stack (`docker-compose.yml`, pasted 2026-07-23):**
self-hosted NetBird is live at `NB_MANAGEMENT_URL=https://fsocietyunraid.xyz`.
The pattern for putting a host on that mesh is a sidecar container, not an
installed system package:

```yaml
services:
  netbird-client:
    container_name: netbird-client
    hostname: <name-for-this-peer>   # shows up as the peer's name in the dashboard
    cap_add:
      - NET_ADMIN
      - SYS_ADMIN
      - SYS_RESOURCE
    devices:
      - /dev/net/tun
    network_mode: host
    environment:
      - NB_MANAGEMENT_URL=https://fsocietyunraid.xyz
      - NB_SETUP_KEY=          # generated per-peer in the NetBird dashboard
    volumes:
      - netbird-client:/var/lib/netbird
    image: netbirdio/netbird:latest
    restart: unless-stopped
volumes:
  netbird-client:
    name: netbird-client
```

`network_mode: host` is why this works without touching Paldeck at all —
the sidecar shares the host's network namespace, so once it's an enrolled
peer, *anything already listening on the host's interfaces* (Paldeck's
`:8080`, already confirmed above) becomes reachable at that peer's mesh IP.
This is the same reason the OG stack didn't need to change the
`palworld-server` container to get NetBird-side reachability for
whatever Jon *does* use the mesh for on that box.

Ingress for the dashboard-facing side of things (Jon's phrasing: "create
the reverse proxy service on the NetBird dashboard and add the ports to
Traefik") is a **manual, dashboard-side operation** on infrastructure Jon
already runs — not something this repo configures or ships. Treated here
as a runbook step, not a build task.

## Resolved — Caddy dropped

**Decision (Jon, 2026-07-23):** dropped, constitution amended. `docs/CONSTITUTION.md`
§4 now reads "Sharing / ingress: **Self-hosted NetBird**" (v1.1). Nothing
in this repo configures Caddy; ingress/TLS for the NetBird dashboard side
stays exactly what Jon already runs (dashboard reverse-proxy + Traefik).

## Rollout order

1. ~~Resolve the Caddy question~~ — done above.
2. Add the `netbird-client` sidecar (block above, hostname set to
   something like `paldeck`) to wherever Paldeck's binary is deployed.
   Generate its setup key from the existing NetBird dashboard.
3. Confirm the peer appears in the dashboard and get its mesh IP.
4. Jon: NetBird-dashboard-side reverse-proxy + Traefik entry for the panel
   (operational step, mirrors the existing pattern — not built here).
5. **Verify, don't assume** (constitution P4): from a second enrolled
   device, actually load the panel through the mesh — and separately,
   confirm `curl` against the host's raw public IP on port 8080 fails/times
   out, so "admin-only via mesh" is a checked fact, not an inferred one.
