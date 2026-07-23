# Plan 004 — Pal Search (technical)

> Implements `spec.md`. This file records **verified format findings** — the
> anti-hallucination trail for the parser.

---

## Verified findings (2026-07-18, from mew-1's real Level.sav)

Hexdump of `/palworld/Pal/Saved/SaveGames/0/EDF99E4475F74438B4BCDAFBFB4895E0/Level.sav`:

```
offset 0x00: d7 35 08 00   uncompressed size (LE) = 537,047
offset 0x04: 91 8d 00 00   compressed size  (LE) = 36,241  (+12B header = file size ✓)
offset 0x08: 50 6c 4d 31   magic "PlM1"
offset 0x0C: 8c 0a ...     compressed stream (0x8C = typical Oodle block start)
```

- **The old community docs ("PlZ" + zlib) are stale.** Palworld ≥ v0.6 writes
  **"PlM" = Oodle-compressed** saves (confirmed via save-tools ecosystem:
  xNul/palworld-host-save-fix#214, Guineabear/Palworld-Pal-Editor, Steam
  discussions). Tools that *write* still emit PlZ (zlib), which the game reads —
  but to *read* current saves we must decompress **Oodle**.
- Oodle is proprietary (Epic/RAD). **No pure-Go decoder exists.**
- The Linux server does **NOT** ship a separate Oodle .so (checked
  `/palworld/Pal/Binaries/Linux/`: only PalServer-Linux-Shipping,
  steamclient.so) — statically linked, so the purego/dlopen trick is out.
- Save path pattern: `/palworld/Pal/Saved/SaveGames/0/<WORLD_ID>/Level.sav`,
  with image-managed backups under `<WORLD_ID>/backup/world/<timestamp>/`.
  File reachable via `docker cp` / SDK CopyFromContainer (works stopped too).

## Decompression options (decision pending — Jon)

| Option | How | Trade-off |
|---|---|---|
| **A. WASM ooz via wazero** | compile powzix/ooz (open-source Oodle decomp, C) to WASM; run with wazero (pure-Go runtime) | keeps pure-Go build; upfront toolchain work; ~medium effort |
| **B. CGO + ooz** | link ooz natively | simplest code; breaks the no-CGO invariant (needs constitution amendment; complicates builds) |
| **C. Helper container** | tiny image w/ palworld-save-tools; Paldeck runs it via Docker SDK to convert PlM→raw GVAS | on-brand (we orchestrate Docker anyway); amends "no sidecar" line in spec; runtime dep on image |
| **D. Go port of Oodle decode** | port Mermaid/Kraken decoder | weeks; heroic; not now |

**DECISION (Jon, 2026-07-18): Option A** — compile the open-source `ooz`
decompressor to WASM (wasi-sdk), embed the blob, run it with `wazero` (pure-Go
WASM runtime). Keeps single-binary + no-CGO. Fallback if the toolchain loses:
C (helper container).

Test corpus: `/tmp/level.sav` (mew-1 fresh world, 36KB→537KB) and the OG world
save (548KB→8.9MB, real Pals) — copies also parked in the scratchpad tarball.

## After decompression (unchanged plan)

raw GVAS → header parse (T-301) → UE property tree (T-302) →
`.worldSaveData.CharacterSaveParameterMap` → per-character embedded RawData
blobs → Pal fields: CharacterID (species), NickName, Level, Rank,
Talent_HP/Melee/Shot/Defense (IVs), PassiveSkillList, Gender, IsPlayer,
OwnerPlayerUId. Reference implementation to consult per-field:
`cheahjs/palworld-save-tools` (Python). Cache parsed result by file mtime.

## API / UI (unchanged)

`GET /api/servers/{id}/pals` (save-then-parse when running) → sidebar **Pals**
page: per-server searchable/sortable table.
