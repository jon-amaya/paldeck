# Tasks 004 — Pal Search

Legend: ✅ done · 🟡 in progress · ⬜ todo · ⏸ deferred

---

## Layer by layer (each verified against the real mew-1 save)

- ✅ **T-300a** — Format identified empirically: header = [u32 rawLen][u32
  compLen]["PlM1"], payload = **Oodle** (not the stale community "PlZ"+zlib).
  Verified on two real saves (mew-1 + OG world Day-305). Decision: **WASM ooz
  via wazero** (Jon picked A). (2026-07-18)
- ✅ **T-310** — Toolchain: wasi-sdk-25 (~/wasi-sdk) + zao/ooz clone (portable
  fork; simde submodule needed). **ooz is GPL-3** → public Paldeck must be
  GPL-3, or swap to helper-container later (Jon informed). (2026-07-18)
- ✅ **T-311** — `ooz.wasm` built (117KB): wrapper.cpp exports
  `paldeck_decompress` (Kraken_Decompress auto-detects codec); build.sh in
  `internal/palsave/wasm/`. Flags: wasm32-wasi reactor, simde, exported
  malloc/free, 1MB stack. (2026-07-18)
- ✅ **T-312/T-313** — `internal/palsave`: PlM (Oodle/WASM via wazero v1.12) +
  PlZ (zlib) unwrap, GVAS magic + exact-length checks, mutex-guarded module.
  **VERIFIED on the real OG save: 548,362 → 8,947,857 bytes, "GVAS", 50ms,
  test PASS.** Full build + vet clean with blob embedded. (2026-07-18)
- ✅ **T-301** — GVAS header parser verified: save v3, UE4 522/UE5 1008, engine
  5.1.1, class `/Script/Pal.PalWorldSaveGame`, 85 custom versions, body@1789.
- ✅ **T-302** — Property-tree parser (`gvas.go`): all UE property types; struct
  map elements resolved by **byte-evidence peek** (looksLikePropertyList),
  which replaced the reference hint-table approach after the foliage nested
  maps broke it. Full 8.9MB tree parses in ~70ms. Errors carry offset+path.
- ✅ **T-303a (exploration)** — `CharacterSaveParameterMap` = 476 entries in the
  OG world. `RawData` is a plain property list at offset 0 → parses with the
  same parser: struct `PalIndividualCharacterSaveParameter` with CharacterID
  ("Penguin"), Level, Exp, Gender enum, **Talent_HP/Shot/Defense (Melee absent
  = 0)**, EquipWaza, FriendshipPoint, OwnerPlayerUId, SlotId, Hp(FixedPoint64).
  NOTE: stored GUIDs are byte-swapped vs display (ca9dd888… ↔ 88D89DCA…).
- ✅ **T-303b** — `palsave.ExtractPals`: typed Pal{species, nick, level, gender,
  4 IVs, passives, owner uid→name via player entries, isPlayer}. Broken
  characters skipped, not fatal. (2026-07-18)
- ✅ **T-304** — `GET /api/servers/{id}/pals`: tar-streams Level.sav from the
  volume via CopyFromContainer (skips nested backups; works stopped),
  REST-save-first when running, 30s TTL cache. **LIVE-VERIFIED: 470 pals +
  3 players from the running OG world** (top: DrillGame lv37). (2026-07-18)
- ✅ **T-305 (as detail tab)** — "Pals" tab in ServerDetail: search
  (species/nick/owner), click-to-sort columns (level + each IV), players
  toggle, passives + resolved owner names. Sidebar-level Pals page deferred.
  *(verify in browser)*

- ✅ **T-306** — Enrichment from palworld-gui game-data (3.4MB copied to
  `frontend/public/game-data/`, embedded): species icons + display names
  (id ↔ save CharacterID; BOSS_/PREDATOR_/RAID_ prefixes → alpha badge),
  Sort-by control (level/IV total/each IV/species + direction), click-through
  Pal detail card: IV bars, trait names + ranks (passives.json), wild spawn
  points in calibrated map coords (pal-spawns.json). (2026-07-18) *(verify)*
- ✅ **T-306b** — Extended stats from the save: Exp, star Rank (condensed),
  soul enhancements (Rank_HP/Attack/**Defence**/CraftSpeed — game's spelling),
  IsRarePal→lucky ✨, FriendshipPoint→Trust, EquipWaza/MasteredWaza→move names
  + elements via activeSkills.json. Live-verified: 7 lucky, 7 condensed,
  1 soul-enhanced in OG world. Map fit-to-panel at 1× fixed. (2026-07-18)
- ⬜ **T-307** — Breeding guide: needs a combi-rank/combination dataset (not in
  the fork's game-data) — import community data, then: child-of(A,B) calc +
  "how to breed X" reverse search.
- ✅ **T-308a** — **Map tab** in ServerDetail: full world-map image (1.8MB,
  embedded; bounds mapX[−1922.44,1233.99] mapY[−2125.30,1031.13] from the
  fork's Leaflet map), drag-pan + wheel/button zoom 1–8× (1× fits the panel,
  centered), live player markers (5s poll, calibrated transform), species
  spawn overlay w/ autocomplete. **Orientation LOCKED (Jon-verified against
  in-game, 2026-07-19): image CSS-rotated −90° (net 90° CCW), marker math
  axis-swapped to match (mapToPct: left←mapY, top←mapX). Don't "fix" it.**
- ✅ **T-308b (layers)** — Map layers: 315 landmarks (fast travel/dungeon/tower
  icons + tooltips, on by default) + 83 field bosses (pal portrait, red ring,
  level badge, toggle) from landmarks.json/bosses.json — both already in map
  coords. (2026-07-19) *(verify)*
- ⬜ **T-308c** — Sidebar-level Pals + Map pages (cross-server pickers).

## Definition of done

US-1..US-3 of `spec.md` observed with real captured Pals.
