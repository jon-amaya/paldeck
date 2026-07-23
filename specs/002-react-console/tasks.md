# Tasks 002 — React Operator Console

Legend: ✅ done · 🟡 in progress · ⬜ todo · ⏸ deferred

---

## Toolchain

- ✅ **T-100** — Node via nvm: node v24.18.0 / npm 11.16.0 (no sudo). (2026-07-17)

## Scaffold

- ✅ **T-101** — Vite React+TS app scaffolded under `frontend/`. (2026-07-17)
- ✅ **T-102** — `vite.config.ts` proxy: `/api` → :8080, `ws: true`. *(verify in browser)*
- ✅ **T-103** — Dark theme (`theme.css`) + app shell (header + create bar +
  empty state), palette from the wireframes.

## Wire to the backend (read paths first)

- ✅ **T-104** — `types.ts` (`Server`) + `api.ts` (typed fetch wrappers).
- ✅ **T-105** — `ServerCard.tsx`: status pill, ports, actions.
- ✅ **T-106** — `App.tsx` polls the list every 5s; cards re-render **without**
  unmounting an open LogConsole.

## The two things the vanilla page did badly

- ✅ **T-107** — `LogConsole.tsx`: component owns its WebSocket + lines, survives
  refreshes, auto-scrolls, caps at 1000 lines. (Fixes the 001 flicker — US-3.) *(verify)*
- ✅ **T-108** — Card actions: Start / Stop / Restart / Delete + confirm. (US-4.) *(verify)*

## The real create flow (frontend + backend together)

- ✅ **T-109** — Backend extended: `store` columns + idempotent migration,
  `docker` env (verified names: `SERVER_DESCRIPTION`, `PLAYERS`,
  `SERVER_PASSWORD`, `DIFFICULTY` [None|Normal|Difficult], `IS_PVP`), `api`
  create validates + threads settings. Build OK. (2026-07-17)
- ✅ **T-110** — `NewServerModal.tsx`: create form wired to the extended API.
  **US-1 VERIFIED**: created `test` via modal → ports stepped to 8212/27016/25576,
  container env confirmed `IS_PVP=true`, `PLAYERS=16`, `DIFFICULTY=None`,
  auto-gen `ADMIN_PASSWORD`. Settings land on the real container. (2026-07-17)

## Polish the UI (before packaging — Jon's call)

- ✅ **T-112** — Cards surface settings: chips for players/difficulty/PvP (PvP
  chip reddens when on) + description line. (2026-07-17) *(verify)*
- ✅ **T-113** — Create success dialog: POST response now returns `adminPassword`
  once (list/get never do — verified via curl probe, HTTP 201), and the UI shows
  a "{name} is ready" dialog with ports + one-time password + Copy button.
  Delete-keeps-volume also re-verified via the probe. (2026-07-17) *(verify UI)*
- ✅ **T-114** — Log console header: name, live connection dot, line count,
  Clear button; friendlier connecting/empty states. (2026-07-17) *(verify)*
- ✅ **T-115** — Action feedback: per-server pending state — spinner on the
  clicked button, all actions locked while in flight, pill flips to amber
  pulsing "stopping…/starting…/restarting…/deleting…" until Docker resolves
  (Stop ≈ 30s). Start/Stop disabled when not applicable. (2026-07-17) *(verify)*
- ✅ **T-118** — Tabbed operator shell (Jon: the wireframe structure): cards →
  Manage → detail view with header actions + tabs Overview | Console | Players |
  Settings. Console mounts on open and survives tab switches (hidden, not
  unmounted). Players = labeled 003 placeholder; Settings = read-only config +
  danger-zone Delete. State-based nav, no router lib. (2026-07-17) *(verify)*
- ✅ **T-119** — Full redesign to "Ops console" (direction A, Jon-approved via
  3-way mockup artifact): dark slate + indigo, Inter UI font, left sidebar
  (dino logo, vector icons, live server sub-list, docker footer), server table
  replaces cards, underline tabs, dense Overview tiles (live metrics tiles
  greyed "—" until 003). Committed dark-only. (2026-07-17) *(verify)*
- ✅ **T-120** — Console ANSI rendering (Jon: "format the logs better"): parse
  SGR escape codes (reset/bold/30-37/90-97) into colored spans mapped to the
  console palette; handle \r progress overwrites; strip non-color escapes.
  Parsed once on arrival (stored as segments), not per render. (2026-07-18) *(verify)*
- ✅ **T-121** — Console timestamps: `Timestamps: true` on ContainerLogs (real
  daemon-side emit times, valid for backlog too); frontend peels the RFC3339Nano
  prefix and renders a dim tabular HH:MM:SS gutter (local time, non-selectable).
  (2026-07-18) *(verify)*
- ✅ **T-116** — Small-screen pass: mobile top bar (logo + running status)
  replaces the hidden sidebar under 860px; detail regained a back button
  (was unreachable on mobile — real bug); tabs scroll horizontally; table
  already scrolls in its wrap. (2026-07-18)

## Stress test (before packaging — Jon's call)

- ✅ **T-117** — Stress run (2026-07-18). Findings & outcomes:
  - **A · hostile inputs:** all held — bad JSON/empty name → 400; XSS/traversal
    name sanitized; 60-char name truncated to 40; players 999→32, -5→1;
    difficulty "banana"→None.
  - **B · 5 concurrent creates:** FOUND 2 REAL BUGS —
    (1) **port-collision race**: two servers both allocated 8217 (SELECT-then-
    insert-later TOCTOU). Fixed: `store.CreateReserving` reserves ports +
    inserts the row in one transaction; create flow reordered to DB-first,
    container-second, row deleted on container failure.
    (2) **SQLITE_BUSY**: 3/5 creates failed "database is locked". Fixed: WAL +
    busy_timeout(5000) pragmas + `SetMaxOpenConns(1)`.
    Re-run after fixes: **5/5 created, all ports unique.**
  - **C · conflict storm** (concurrent stop+restart+start on a running server):
    Docker serialized, no crash/wedge, API and Docker state agree after settle
    and after final stop.
  - Re-confirmed: graceful Stop exits **137** (Palworld not down within 30s) —
    raises priority of **T-013** (RCON save/shutdown before stop).

## Ship it as one binary (AFTER polish + stress)

- ✅ **T-111** — Packaged: `npm run build` → `frontend/dist` (65KB gz JS,
  per-script font subsets); `main.go` embeds `all:frontend/dist`; old `web/`
  placeholder deleted; T-011 error text fixed alongside. Verified: `./paldeck`
  (19MB) serves the React app, hashed assets, and the API from one file.
  (2026-07-18)
- ✅ **T-013 interim** — Stop/Restart grace 30s→90s (image saves world on
  SIGTERM but needs longer than 30s; killed exit-137). Full RCON-first shutdown
  still tracked in 001/003. (2026-07-18)

## Definition of done for spec 002

US-1..US-4 observed; UI polished (T-112..T-116) and stress-tested (T-117); then
built SPA embeds and serves from the Go binary; build clean.

**✅ SPEC 002 COMPLETE (2026-07-18).**

## Post-004 dashboard completion pass (2026-07-19, Jon: "dashboard is incomplete")

- ✅ **T-122** — Home stat tiles (servers/running/players-online live via
  parallel metrics poll of running servers, panel version); table Players
  column live. Sidebar fully active: Pals/Map deep-link into the first running
  server's tab (ServerDetail gained `initialTab`), Settings → real panel info
  page. Console gained the "earlier logs" backlog divider (1.2s heuristic).

## Motion + richness pass (2026-07-23, Jon: "looks weak vs palworld-gui/Catalyst")

Targeted the 3 things Jon flagged: missing polish/motion, flat dashboards,
low density.

- ✅ **T-123 sparklines** — `Sparkline.tsx` (dataviz-skill compliant: single
  hue, thin 2px line, rounded data-ends, hover crosshair+tooltip, number stays
  primary/sparkline supplementary — no palette validation needed for a
  single-series magnitude line). Overview's Players/CPU/Memory tiles now carry
  a ~5-min rolling trend (`HISTORY_LEN=60` samples at the existing 5s poll,
  reset on server switch) instead of a bare instant value.
- ✅ **T-124 motion** — tab switches fade+slide via a `.tabpanel` class whose
  `tabIn` keyframe replays on `display:none→block` (no remount, console/map
  state untouched); button press scale; table row hover highlight; toast
  slide-in (`animation-fill-mode: forwards` — a real bug caught before
  shipping: removing the static centering transform without `forwards` would
  have snapped toasts off-center after 220ms); running-status dot gets a slow
  breathing glow (pending keeps the faster pulse); skeleton shimmer bars
  replace bare "Loading…" text in Settings/Backups/Pals. All motion respects
  `prefers-reduced-motion`.
- ✅ **T-125 richer home** — 4 stat tiles → icon + big-number cards
  (`.stat-tile`), semantic tinting (Running green / Players indigo when > 0),
  hover lift.

Build+vet clean, frontend typecheck clean. *(Visual verification is Jon's —
no in-session browser/screenshot tool for this app.)*

## Real design implementation (2026-07-23) — after 4 mockup rounds

Read palworld-gui's `ui.tsx` and Catalyst's `ServerCard.tsx`/`globals.css`
directly (not memory) to find concrete, specific techniques rather than
guessing at another palette:

- ✅ **T-126 accent** — `--acc`/`--acc-strong` → rose (`#e0447a`/`#ef6b98`,
  Jon's pick from a live swatch-picker mockup), replacing the indigo that
  read as generic "AI tool purple."
- ✅ **T-127 weight/radius language** — pulled exact values from
  palworld-gui's `ui.tsx` (`font-extrabold` buttons, full pill radius, 2px
  borders) and applied throughout: buttons/badges/pills → pill-shaped,
  weight 700→800, 1px→2px borders; nav/subitem/headings/tile labels bumped
  ~550-650→700-800. **Caught the same missing-font-weight bug twice** — first
  in the mockup's sidebar list, confirmed it was real by grepping the actual
  `.subitem` rule (had no `font-weight` at all, default 400) and fixed it in
  `theme.css` alongside the rest.
- ✅ **T-128 server list → cards** — `ServerRow.tsx` rewritten as
  `ServerCard`: avatar (initial letter, accent-tinted) + name + muted
  subtitle replaces bare text (Vercel/Linear/Slack-style identity block);
  thin CPU/Memory/Players progress bars sourced from `metricsById` (already
  polled in `App.tsx`, just wasn't displayed); port pills; hover accent rail.
  `App.tsx` swapped the `<table>` wrapper for `.cards`.
- ✅ **T-129 detail header** — same avatar+subtitle block added next to
  `ServerDetail`'s `<h1>`.

Typecheck + build clean; verified live (`mew-1` present, panel healthy).

- ✅ **T-131 fonts + tab bar** (Jon: "look at their console... has color" led into a
  broader Catalyst pass) — read `ServerDetailsPage.tsx`'s actual tab-bar JSX:
  it's one padded rounded container, active tab = solid accent-filled pill
  (not an underline) — that's the "different colors" Jon saw, not per-tab
  hues. Ported that pattern. Fonts confirmed from `globals.css`: DM Sans
  (body) + Outfit (`.font-display`, applied only to prominent text — server
  name, h1s, brand). Cascadia Code kept for console/data (Jon's own earlier,
  separate pick). Noted for Jon: their other tabs (SFTP/Databases/Users/Admin)
  are generic hosting-platform features that don't apply to a single-operator
  Palworld tool; Activity log + Alerts are the two worth a future spec.
- ✅ **T-132 semantic log highlighting** — read their actual highlighter
  (`components/console/processEntry.ts`, not just the CSS): ANSI (via
  `ansi-to-html`) plus a **second regex pass** over the text for
  ERROR/WARN/INFO keywords, UUIDs, IPs, URLs, and embedded timestamps that
  ANSI never colors. Ported the same rule set (their exact patterns) as
  `applySemantic()` in `LogConsole.tsx` — segment-based, not HTML-string
  splicing, so it stays innerHTML-free/XSS-safe (a safer architecture than
  theirs, which needs DOMPurify because they inject raw HTML). Added
  `--info` token (kept separate from the user-customizable accent, per the
  dataviz skill's semantic-color rule). **Verified against real mew-1 log
  output**: `/v1/api/info` lines will highlight "info" (blue) and the
  bracketed in-text timestamp (violet) — confirmed by direct regex-vs-string
  match, not guessed.
- ✅ **T-130 accent picker** (Jon: "you should allow changing accents") — the
  swatch-picker UX from the mockup, for real: `accent.ts` (5 presets incl.
  rose/teal/cobalt/amber/indigo, `--acc`/`--acc-strong` via
  `documentElement.style.setProperty`, persisted to `localStorage`, applied
  in `main.tsx` pre-paint to avoid a flash). Picker lives in Settings.
  Build+vet+typecheck clean, verified live.
- ✅ **T-133 new-server modal + settings tab cards** (Jon: "look how they do
  their settings, their new server popup — ours are very basic") — read
  Catalyst's `CreateServerModal.tsx` (705 lines, 4-step wizard),
  `ServerTabCard.tsx`, and `ServerSettingsTab.tsx` in full. Paldeck's forms
  are far shorter than Catalyst's generic multi-node platform, so ported the
  *grouping* idiom rather than a full stepper:
  - New `theme.css` classes: `.formcard`/`.formcard-head`/`.formcard-ic` — a
    quieter, 1px-border card (distinct from `.scard`'s thicker list-item
    treatment, matching Catalyst's own two-tier card system) — and
    `.tab-intro`/`.tab-intro-ic` (icon + title + description atop a panel,
    their `TabHeader` pattern). Modal gained a real open animation
    (`modalIn`/`backdropIn` keyframes) and a `.modal-lg` width variant plus a
    subtitle line under the title (`.modal-head-text`/`.modal-sub`).
  - `NewServerModal.tsx` — the flat field list is now three `.formcard`
    groups (Identity / Game rules / Access), each with a small icon +
    label, mirroring Catalyst's `SectionHeader`. New 3 local stroke icons
    (`IcTag`/`IcSliders`/`IcLock`) in the same 24px currentColor style
    already used for sidebar/stat icons.
  - `WorldSettingsPanel.tsx` — swapped `.set-cat` for `.formcard` on all 7
    category groups (General + the 6 `CATS`), so each is now a visually
    distinct card instead of an unbordered block; added a `.tab-intro`
    header (gear icon + "World settings" + a one-line description of
    Save vs. Apply & restart). `.set-cat` rule removed from `theme.css` as
    dead (only those two files referenced it); `.wsform` changed to a
    gapped flex column so `.formcard` spacing isn't double-counted against
    the existing gap.
  - **Environment note**: this WSL instance had lost its Linux Node and Go
    weren't on `PATH` (`node`/`go` unresolved; `npm`/`npx` were silently
    falling back to Windows Node via interop, which fails on this repo's
    UNC path — first with a Windows/Linux native-binary mismatch in
    `node_modules` after a plain reinstall, then with an ESM
    `file://wsl.localhost/...` resolution bug in vite/rolldown). Fixed by
    installing a portable Linux Node under `~/.local/node` (no sudo) and
    invoking Go via its real path, `/usr/local/go/bin/go` — both binaries
    were present on disk, just missing from this shell session's `PATH`.
    Reinstalled `frontend/node_modules` with the Linux node so native
    bindings (rolldown) match.
  - Typecheck (`tsc -b`) and `vite build` clean; `go build` clean; redeployed
    the panel binary and verified live against `mew-1` — confirmed the
    served JS/CSS bundle actually contains `formcard`/`tab-intro` (not a
    stale embed) and that `/api/servers` + `/api/servers/{id}/settings`
    still respond correctly.

- ✅ **T-134 type scale + World Settings row layout** (Jon: "look how they
  utilize space everything is centered and bigger fonts ours we have a lot
  of free space and fonts are really tiny... palworld gui has a lot more
  settings and options") — read palworld-gui's `App.tsx`, `ui.tsx`,
  `SettingsEditor.tsx`, `InstanceSettingsTab.tsx`, and the shared
  `options.ts` schema directly (not memory) rather than eyeballing.
  - **Found the actual bug**: most of Paldeck's "bigger" type sizes only
    applied inside a `@media (min-width: 1700px)` block — anything below
    that (most laptops, unmaximized windows) never saw them. Promoted those
    values to the unconditional default in `theme.css` and left the
    breakpoint for canvas-size-only changes (sidebar width, content
    max-width). Caught a real regression while doing it: that block set
    `.mhead h1, .dhead h1` to the *same* 19px, which meant `.dhead h1`
    (whose real default was 21px) actually got **smaller** on wide
    monitors — gone now that the override is removed.
  - Bumped body 14→15px, buttons 12.5→14px (13px→14.5px for `.solid`),
    tabs 13→14px, table 13.5→14.5px, `.tile b` 14.5→16px, sidebar `.nav`/
    `.subitem` up ~0.5px with matching padding — brought the interactive-
    element floor in line with palworld-gui's consistent `text-sm
    font-extrabold` (14px/800) pattern instead of Paldeck's previous
    11-13px floor.
  - `.formcard-head b` (card/section titles) 12.5px/700 → 14px/800,
    matching their h3 pattern exactly.
  - **World Settings rebuilt**: replaced `.set-grid` (small boxes in an
    auto-fill grid — the "lot of free space" culprit on wide screens) with
    palworld-gui's actual `SettingsEditor.tsx` pattern — full-width
    label-left/control-right rows (new `.opt-row`/`.opt-list`), a real
    range slider next to the number box for every rate-style option (new
    `.opt-range`), and a pill `Toggle` component (new `.opt-toggle`)
    replacing the old on/off/default `<select>` for every boolean. min/max/
    step for the slider on all ~30 existing numeric options were pulled
    directly from palworld-gui's `packages/shared/src/options.ts` (the same
    underlying `PalWorldSettings.ini` keys) — not guessed.
  - **Verified, not assumed, the "more options" claim**: their schema has
    ~112 options across the same 7 categories vs. Paldeck's ~41. Confirmed
    separately (WebFetch, thijsvanloef image README) that the actual server
    image Paldeck drives already supports essentially the full ~100+ option
    set as env vars — so expanding coverage is real, unblocked work, not a
    backend limitation. Scoped out of this pass (would roughly double the
    CATS list) and flagged to Jon as the next step rather than folding it
    into an already-large diff.
  - Typecheck + `vite build` + `go build` clean; redeployed and verified
    live — confirmed the served bundle contains `opt-toggle`/`opt-range`
    (not a stale embed) and `/api/servers/{id}/settings` still responds
    correctly against `mew-1`.

- ✅ **T-135 max-players cap: 32 → 99** (Jon: "can you see all the options
  [palworld-gui's create dialog] gives you to see what we are missing") —
  read their `CreateDialog` (`App.tsx:508-784`) in full. Their create form
  turned out to be *thinner* than Paldeck's, not richer: only name/backend-
  type/path/port/max-players/password — difficulty, PvP, admin password,
  and description aren't even asked at creation, only in Settings after
  the fact (Paldeck already asks for all of those upfront). Everything
  else in their dialog (native/Docker/k8s backend choice, custom server
  path, custom Docker image, manual port entry) is about their multi-
  backend architecture and doesn't apply to Paldeck's Docker-only,
  auto-pooled-port design (constitution invariant) — not a gap.
  One real bug did turn up: Paldeck capped max players at 32 in both
  `NewServerModal.tsx` and `WorldSettingsPanel.tsx`, with no backend
  enforcement behind it (checked `store.go`/`docker.go` — pure passthrough
  to `PLAYERS=`). Palworld's own documented ceiling is 99 (confirmed via
  palworld-gui's `ServerPlayerMaxNum: max:99` schema entry) — the 32 was
  an unfounded guess. Fixed both spots to 99. Typecheck + build clean;
  redeployed; confirmed the served JS contains `max:99` with no leftover
  `max:32`, and `/api/health` responds against `mew-1`.

- ✅ **T-136 formcard icon bug + Catalyst-style blending + General row
  layout** (Jon: "the card design looks really ugly also the icon for
  identity game rules and access do not show make the color blending more
  like catalyst but i want palworlds spacing and options") — found the
  actual root cause of the missing icons via CSS specificity, not
  guesswork: `.formcard-head span { display: block; color: var(--mut); ...
  }` was written for a subtitle span that was never actually used anywhere
  in the codebase (checked with `grep -rn formcard-head` across all
  `.tsx`), but it also matches `.formcard-ic` (itself a `<span>`) — and
  being later in the file with higher specificity than `.formcard-ic`
  alone, it silently overrode the icon's `display: grid; place-items:
  center` centering and its pink `color: var(--acc-strong)` down to
  `var(--mut)` gray. Renamed the dead rule to a properly scoped
  `.formcard-sub` (unused for now, available for a real subtitle later
  without colliding with `.formcard-ic` again).
  - `.formcard`'s border/background reworked to the same opacity-blended
    idiom `.scard` already uses (and that Jon approved there): border
    `color-mix(..., var(--line) 65%, transparent)` instead of a flat solid
    line, background blended between `--panel2`/`--panel`, and a
    `:hover { border-color: color-mix(..., var(--acc) 22%, var(--line)) }`
    — this is literally Catalyst's own `ServerTabCard.tsx` pattern
    (`border-border/40`, `hover:border-primary/15`), not an approximation.
  - World Settings' "General" section was mixing two layouts in one card
    (a `.set-grid` box-grid above, an `.opt-row` below for PvP) — converted
    the whole section to `.opt-row`s for consistency, including a slider
    for Max players (palworld-gui's own `SettingsEditor` shows a slider
    for any int with min/max, `ServerPlayerMaxNum` included — matches "I
    want palworld's spacing and options"). New `.opt-text` class for the
    row-style text inputs (description, password). Removed `.set-grid`
    entirely — confirmed dead (`grep` found zero remaining uses) after this
    change.
  - Typecheck + `vite build` + `go build` clean; redeployed; confirmed the
    served CSS contains the renamed `.formcard-sub` and zero occurrences of
    the buggy `formcard-head span` selector, and `/api/health` responds
    against `mew-1`.

- ✅ **T-137 direction reset: shadcn/Catalyst, not palworld-gui's chunky
  language** (Jon: "what design are we going for i dont want this material
  design i want modern ui design all across" — flagged shadows, thick pill
  buttons/borders, icon badges, and "the whole vibe"; asked for Linear/
  Vercel/shadcn style). This session had pulled weight/radius/border
  language from palworld-gui's `ui.tsx` (font-extrabold, full-pill 999px
  buttons, 2px borders) — that's what was reading as Material. Reversed it
  by reading Catalyst's **actual shadcn primitives** this time, not just
  its page-level JSX: `components/ui/button.tsx`, `card.tsx`, `badge.tsx`,
  `input.tsx`, `tabs.tsx`, and `stats-card.tsx` (their real KPI-tile
  component). Verified concretely, not approximated:
  - Buttons/inputs: `rounded-lg` (8px), `border` (1px, not 2px),
    `font-medium`/`font-semibold` (not extrabold), `shadow-sm` only on the
    filled primary variant — everything else unshadowed.
  - Cards: `rounded-xl` (12px), border, and a *found the exact value*
    shadow token in their `tailwind.config.js`:
    `shadow-surface-dark: 0 1px 2px 0 rgb(0 0 0 / 0.3)` — used that literal
    value instead of guessing at "subtle."
  - Badges/chips: `rounded-md` (6px), tinted background at ~10-15%
    opacity + matching text color, no border for filled variants.
  - Their Switch primitive: `rounded-full` track + `shadow-lg` thumb —
    confirms toggles are correctly the *one* pill-shaped control even in
    an otherwise flat language; left `.opt-toggle` alone.
  - Their StatsCard: icon chip is `rounded-md` (not a circle), ~10% tint,
    `hover:border-primary/20 hover:bg-primary/[0.02]` (flat tint, no
    lift/transform) — ported this exactly for `.stat-tile`, removing its
    `transform: translateY(-1px)` hover-lift.
  Applied across `theme.css` uniformly: every `border-radius: 999px` on
  buttons/tabs/badges/icon-chips → 6-8px (confirmed via the served bundle:
  zero remaining `999px` except the 3 legitimately pill-shaped elements —
  `.mbar-track` progress bar and `.opt-toggle`); every `2px`/`1.5px` border
  → `1px`; font-weight 700-800 → 500-650 on buttons/nav/badges/table
  headers/card titles (headings like `.mhead h1`/`.dhead h1` left bold —
  that's normal in shadcn too, `CardTitle` is `font-semibold text-xl`, the
  issue was chrome/controls, not headings); `.modal`'s dramatic
  `0 18px 50px` shadow → `0 8px 24px rgba(0,0,0,.4)`, `.toast` similarly
  reduced; icon-badge tint opacity 14-16% → 10%, radius → 7-9px (rounded-md
  scale, not a big circle).
  - Also extracted the pill `Toggle` component (previously private to
    `WorldSettingsPanel.tsx`) into a shared `components/Toggle.tsx` and
    swapped `NewServerModal.tsx`'s old checkbox-styled PvP field to use it
    — "modern UI... all across" meant the two forms shouldn't use two
    different boolean-control idioms.
  - Typecheck + `vite build` + `go build` clean; redeployed; confirmed live
    (bundle has exactly 3 remaining `999px` uses, all legitimate; `/api/
    health` responds against `mew-1`).
