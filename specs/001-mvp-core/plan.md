# Plan 001 — MVP Core (technical)

> **How.** Implements `spec.md` within `docs/CONSTITUTION.md`. Describes the
> code as it actually exists so it doubles as an architecture map.

---

## Shape

Single `package main` binary. Three internal packages, one HTTP surface, an
embedded web console.

```
main.go                 entry point: config → open DB → docker client → serve
internal/store/         SQLite persistence (servers + ports)
internal/docker/        thin wrapper over the Docker SDK (one Palworld container)
internal/api/           net/http routes (REST) + ws.go (WebSocket logs)
web/index.html          embedded operator console (vanilla JS, dark theme)
```

Data flow for a lifecycle action:
`browser → REST → api → docker client → dockerd → container`, and for logs:
`container → dockerd → docker client → api (ws) → browser console`.

## Key decisions

- **Std-lib routing only** — Go 1.22 `ServeMux` with `"POST /api/servers/{id}/start"`
  patterns and `r.PathValue("id")`. No router dependency.
- **TTY containers** (`Tty: true`) so `ContainerLogs` returns one raw combined
  stream — read line-by-line with a `bufio.Scanner`, no stdcopy demuxing.
- **Status is never stored** — always read live from Docker at list time, so the
  UI can't show a stale "running" for a crashed server.
- **Ports** — `store.AllocatePorts()` walks existing game ports, picks the first
  free 8211+N, derives query=27015+N and rcon=25575+N.
- **Volumes** — `paldeck-<id>` named volume mounted at `/palworld`; `Remove`
  uses `RemoveVolumes: false` so worlds persist.
- **Secrets** — `AdminPass` has a `json:"-"` tag; it exists server-side only.
- **Graceful everything** — 30s container stop; 5s HTTP server shutdown on
  SIGINT/SIGTERM.

## Dependencies (pinned in go.mod)

| Module | Purpose |
|--------|---------|
| `github.com/docker/docker` | Docker Engine SDK (client) |
| `github.com/docker/go-connections/nat` | port/binding types |
| `github.com/coder/websocket` | log streaming |
| `modernc.org/sqlite` | pure-Go SQLite driver |

No new dependency is added without updating this table.

## Verified API notes (guardrail P4)

- Image presence check uses `ImageInspectWithRaw` (not `ImageInspect`).
- Restart policy uses `container.RestartPolicyUnlessStopped` constant (not a raw
  `"unless-stopped"` string).
- Docker client built with `client.FromEnv` + `WithAPIVersionNegotiation()`;
  on Linux this defaults to the `/var/run/docker.sock` unix socket.
- **`github.com/pkg/errors` pinned to v0.9.1** (was 0.8.1). Docker v27.3.1 is
  used in `+incompatible` mode, so Go can't read Docker's own dep requirements
  and our go.mod must supply them; `go mod tidy` floored pkg/errors at 0.8.1,
  which lacks `errors.Is/As` → the SDK failed to compile. `go get
  github.com/pkg/errors@v0.9.1` fixed it (2026-07-17, first WSL build, T-006).
- **SQLite concurrency hardening** (2026-07-18, from the 002 stress test):
  DSN pragmas `journal_mode(WAL)` + `busy_timeout(5000)`, plus
  `db.SetMaxOpenConns(1)` — one writer connection, no SQLITE_BUSY.
- **Atomic port reservation**: `AllocatePorts` was removed; port pick + row
  insert now happen inside one transaction (`store.CreateReserving`), and the
  API creates DB-first / container-second (row deleted if Docker fails). The
  old flow double-allocated ports under concurrent creates.

## Known follow-ups (tracked in tasks.md, not silently done)

- `main.go` error text still says "is Docker Desktop running?" — reword for the
  Linux Engine reality.
- Reconciliation on boot using `ManagedIDs()` (adopt/repair containers the DB
  knows about) — deferred, noted.
