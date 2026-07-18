# Plan 002 — React Operator Console (technical)

> **How.** Implements `spec.md` within `docs/CONSTITUTION.md`.

---

## Layout

```
frontend/                 React + Vite + TS source (dev lives here)
  index.html              Vite entry
  vite.config.ts          dev proxy /api + /api/*/logs (ws) → :8080
  src/
    main.tsx              React root
    App.tsx               layout: header + server list
    api.ts                typed fetch wrappers for the REST API
    types.ts              Server type (mirrors store.Server JSON)
    components/
      NewServerModal.tsx  the create form (real settings)
      ServerCard.tsx      one server: status pill, ports, actions
      LogConsole.tsx      WebSocket log panel (its own component/state)
    theme.css             the dark operator palette
  dist/                   `vite build` output (embedded by Go)
```

Go side: `main.go` swaps its `//go:embed web` for `//go:embed frontend/dist`
(kept behind a build step). During dev we don't rebuild Go for UI changes — we
run Vite separately and let it proxy to the running Go server.

## Dev vs prod

- **Dev:** `go run .` on :8080 (API only matters) **and** `npm run dev` (Vite)
  on :5173. Vite proxies `/api` → :8080, including the `/api/servers/{id}/logs`
  WebSocket upgrade. You develop against `http://localhost:5173` with hot reload.
- **Prod:** `npm run build` → `frontend/dist` → `go build` embeds it → the Go
  server serves the built SPA at `/`. Single binary, per the constitution.

## Why a component fixes the flicker (the 001 bug)

The vanilla page wiped `list.innerHTML` on every poll, destroying the log DOM.
In React, `LogConsole` owns its own state (an array of lines) and its WebSocket
in a `useEffect` keyed by server id. A background poll that updates the server
list re-renders *cards*, but React's reconciliation keeps the mounted
`LogConsole` and its accumulated lines intact. No wipe, no orphaned socket.

## Backend changes this needs (tracked as tasks)

The create endpoint currently accepts only `{name}`. To collect real settings:

- Extend `POST /api/servers` body → name, description, maxPlayers,
  serverPassword, adminPassword?, difficulty, pvp.
- Thread those into `store.Server` (new columns) + `docker.CreateOpts` (new env
  vars: `SERVER_DESCRIPTION`, `PLAYERS`, `SERVER_PASSWORD`, `DIFFICULTY`, and a
  PvP settings entry). Keep auto-generated admin password when blank.
- Migrate the SQLite schema additively (new nullable columns).

Each of these is a small, explained step — not one big change.

## Dependencies added

- Node.js (dev toolchain, in WSL) — via nvm (no sudo, version-managed).
- Frontend: `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `typescript`,
  `@types/react`, `@types/react-dom`. No UI framework yet — hand-rolled CSS to
  match the wireframes (revisit later if wanted).

## Guardrails

- No new Go dependency without updating 001/002 plan tables.
- Verify Vite proxy handles the WebSocket (`ws: true`) — test logs early.
- Keep the embed path change (main.go) as its own reviewable step.
