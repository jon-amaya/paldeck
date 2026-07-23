# Spec 008 — Guilds Tab

Status: 🔴 **BLOCKED** (2026-07-19) — do not resume without new data or reference

## What's blocked

`GroupSaveDataMap`'s per-entry `RawData` is Palworld's own hand-packed binary
struct (`FPalGroupSaveDataParameters`), not a UE property list — unlike every
other save structure Paldeck parses (Pals, players), which "just worked" via
the generic property-tree parser.

Implemented the layout exactly as documented in the community reference
(`cheahjs/palworld-save-tools`, `rawdata/group.py`): guid → fstring name →
tarray(member handles) → [byte org_type, tarray(base ids)] → ... Verified
byte-for-byte against two real "Organization"-type groups from mew-1's
imported OG-world save (`internal/palsave/groups.go`, `decodeGroup`).

**Result:** the known-good header fields (id, name, member count) decode
correctly as empty/zero. The very next field — meant to be `base_ids` array
count — comes out as a huge implausible number, but not randomly: it's a
small integer (2, 3, one per group, matching group index) sitting at a
consistent offset, with no room left in the 37-byte buffer for the array it's
supposedly counting. That's the signature of a genuine layout change in a
newer Palworld patch that the reference decoder hasn't caught up to for the
`Organization` group type (community sources note "recent updates changed the
binary struct layout").

Checked two shortcuts, both dead ends:
- Player character fields (property-list, reliable) carry **no** guild
  reference at all.
- `BaseCampSaveData` is **also** raw binary (own undeciphered layout).

## Why parked, not pushed through

- No real `Guild`/`IndependentGuild` example exists in the available test
  saves (mew-1's world only has auto `Organization` entries) — can't
  triangulate a second data point to solve the real offsets.
- Guessing byte offsets without verification would violate the project's
  empirical-verification rule (constitution P4) — better to ship nothing than
  ship wrong data silently.

## To resume

Need either: (a) a save containing a real player-formed Guild to test against
(the `Guild`/`IndependentGuild` branches may differ from the broken
`Organization` branch), or (b) a currently-accurate reference decoder for this
exact game version's `FPalGroupSaveDataParameters` layout.

`internal/palsave/groups.go` (decoder, matches the *documented* layout) and
the exploration tests in `palsave_test.go` (`TestExploreGuilds`,
`TestExtractGroupsRealSave`, `TestExplorePlayerFields`, `TestExploreBaseCamps`)
stay in the tree as a running start — compiles clean, not wired into any API
route, safe to leave dormant.
