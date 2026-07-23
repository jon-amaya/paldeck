package palsave

import (
	"context"
	"os"
	"testing"
)

// Run against a real save:
//
//	PALSAVE_TEST_FILE=/tmp/og-world/Saved/SaveGames/0/<id>/Level.sav go test ./internal/palsave
func TestDecompressRealSave(t *testing.T) {
	path := os.Getenv("PALSAVE_TEST_FILE")
	if path == "" {
		t.Skip("PALSAVE_TEST_FILE not set")
	}
	sav, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := Decompress(context.Background(), sav)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("decompressed %d → %d bytes, magic %q", len(sav), len(raw), raw[0:4])
	if string(raw[0:4]) != "GVAS" {
		t.Fatalf("not GVAS")
	}
}

func TestParseTreeRealSave(t *testing.T) {
	path := os.Getenv("PALSAVE_TEST_FILE")
	if path == "" {
		t.Skip("PALSAVE_TEST_FILE not set")
	}
	sav, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := Decompress(context.Background(), sav)
	if err != nil {
		t.Fatal(err)
	}
	h, err := ParseHeader(raw)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("header: save v%d, UE4 %d, UE5 %d, engine %d.%d.%d, class %s, custom versions %d, body at %d",
		h.SaveVersion, h.UE4Version, h.UE5Version, h.EngineMajor, h.EngineMinor, h.EnginePatch,
		h.SaveClass, h.CustomCount, h.BodyOffset)

	body, err := ParseBody(raw, h.BodyOffset)
	if err != nil {
		t.Fatal(err)
	}
	for k, v := range body {
		t.Logf("root key: %s (%T)", k, v)
	}
	wsd, ok := body["worldSaveData"].(StructVal)
	if !ok {
		t.Fatalf("no worldSaveData struct")
	}
	fields, ok := wsd.Value.(map[string]any)
	if !ok {
		t.Fatalf("worldSaveData not a property list")
	}
	for k, v := range fields {
		t.Logf("worldSaveData.%s (%T)", k, v)
	}

	chars, ok := fields["CharacterSaveParameterMap"].([]KV)
	if !ok {
		t.Fatalf("CharacterSaveParameterMap wrong shape: %T", fields["CharacterSaveParameterMap"])
	}
	t.Logf("=== %d characters in the world ===", len(chars))

	// RawData is itself a property list starting at offset 0 — parse one.
	if val, ok := chars[0].Value.(map[string]any); ok {
		if rd, ok := val["RawData"].([]byte); ok {
			inner, err := ParseBody(rd, 0)
			if err != nil {
				t.Fatalf("RawData parse: %v", err)
			}
			if sp, ok := inner["SaveParameter"].(StructVal); ok {
				if fields, ok := sp.Value.(map[string]any); ok {
					t.Logf("--- SaveParameter fields of character 0 (struct %s) ---", sp.Type)
					for k, v := range fields {
						t.Logf("  %s = %v", k, v)
					}
				}
			}
		}
	}
	for i, c := range chars {
		if i >= 2 {
			break
		}
		t.Logf("entry %d key: %#v", i, c.Key)
		val, _ := c.Value.(map[string]any)
		for k, v := range val {
			if b, isBytes := v.([]byte); isBytes {
				t.Logf("entry %d value.%s: %d raw bytes, head: % x", i, k, len(b), b[:min(24, len(b))])
			} else {
				t.Logf("entry %d value.%s (%T): %v", i, k, v, v)
			}
		}
	}
}

func TestExploreGuilds(t *testing.T) {
	path := os.Getenv("PALSAVE_TEST_FILE")
	if path == "" {
		t.Skip("PALSAVE_TEST_FILE not set")
	}
	sav, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := Decompress(context.Background(), sav)
	if err != nil {
		t.Fatal(err)
	}
	h, err := ParseHeader(raw)
	if err != nil {
		t.Fatal(err)
	}
	body, err := ParseBody(raw, h.BodyOffset)
	if err != nil {
		t.Fatal(err)
	}
	fields := body["worldSaveData"].(StructVal).Value.(map[string]any)

	group, ok := fields["GroupSaveDataMap"].([]KV)
	if !ok {
		t.Fatalf("GroupSaveDataMap wrong shape: %T", fields["GroupSaveDataMap"])
	}
	t.Logf("=== %d groups ===", len(group))
	for i, g := range group {
		if i >= 4 {
			break
		}
		t.Logf("group %d key: %v", i, g.Key)
		val, _ := g.Value.(map[string]any)
		for k, v := range val {
			if b, isBytes := v.([]byte); isBytes {
				t.Logf("  %s: %d raw bytes, head %x", k, len(b), b[:min(64, len(b))])
			} else {
				t.Logf("  %s (%T) = %v", k, v, v)
			}
		}
	}

	extra, ok := fields["GuildExtraSaveDataMap"].([]KV)
	if ok {
		t.Logf("=== %d GuildExtraSaveDataMap entries ===", len(extra))
		if len(extra) > 0 {
			t.Logf("entry 0 key: %v value: %v", extra[0].Key, extra[0].Value)
		}
	} else {
		t.Logf("GuildExtraSaveDataMap wrong shape: %T", fields["GuildExtraSaveDataMap"])
	}
}

func TestExplorePlayerFields(t *testing.T) {
	path := os.Getenv("PALSAVE_TEST_FILE")
	if path == "" {
		t.Skip("PALSAVE_TEST_FILE not set")
	}
	sav, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := Decompress(context.Background(), sav)
	if err != nil {
		t.Fatal(err)
	}
	h, _ := ParseHeader(raw)
	body, _ := ParseBody(raw, h.BodyOffset)
	fields := body["worldSaveData"].(StructVal).Value.(map[string]any)
	chars := fields["CharacterSaveParameterMap"].([]KV)

	found := 0
	for _, c := range chars {
		val, _ := c.Value.(map[string]any)
		rd, _ := val["RawData"].([]byte)
		if len(rd) == 0 {
			continue
		}
		inner, err := ParseBody(rd, 0)
		if err != nil {
			continue
		}
		sp, ok := inner["SaveParameter"].(StructVal)
		if !ok {
			continue
		}
		spf, ok := sp.Value.(map[string]any)
		if !ok {
			continue
		}
		isPlayer, _ := spf["IsPlayer"].(bool)
		if !isPlayer {
			continue
		}
		found++
		t.Logf("=== player entry (struct %s) ===", sp.Type)
		for k, v := range spf {
			if b, isBytes := v.([]byte); isBytes {
				t.Logf("  %s: %d raw bytes", k, len(b))
			} else {
				t.Logf("  %s (%T) = %v", k, v, v)
			}
		}
		if found >= 1 {
			break
		}
	}
	t.Logf("found %d player entries examined", found)
}

func TestExploreBaseCamps(t *testing.T) {
	path := os.Getenv("PALSAVE_TEST_FILE")
	if path == "" {
		t.Skip("PALSAVE_TEST_FILE not set")
	}
	sav, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := Decompress(context.Background(), sav)
	if err != nil {
		t.Fatal(err)
	}
	h, _ := ParseHeader(raw)
	body, _ := ParseBody(raw, h.BodyOffset)
	fields := body["worldSaveData"].(StructVal).Value.(map[string]any)
	bases, ok := fields["BaseCampSaveData"].([]KV)
	if !ok {
		t.Fatalf("BaseCampSaveData wrong shape: %T", fields["BaseCampSaveData"])
	}
	t.Logf("=== %d base camps ===", len(bases))
	for i, b := range bases {
		if i >= 2 {
			break
		}
		val, _ := b.Value.(map[string]any)
		t.Logf("base %d key: %v", i, b.Key)
		for k, v := range val {
			if by, isBytes := v.([]byte); isBytes {
				t.Logf("  %s: %d raw bytes, head %x", k, len(by), by[:min(40, len(by))])
			} else {
				t.Logf("  %s (%T) = %v", k, v, v)
			}
		}
	}
}

func TestExtractGroupsRealSave(t *testing.T) {
	path := os.Getenv("PALSAVE_TEST_FILE")
	if path == "" {
		t.Skip("PALSAVE_TEST_FILE not set")
	}
	sav, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := Decompress(context.Background(), sav)
	if err != nil {
		t.Fatal(err)
	}
	// debug: decode the first group directly so parse errors are visible
	h, _ := ParseHeader(raw)
	body, _ := ParseBody(raw, h.BodyOffset)
	fields := body["worldSaveData"].(StructVal).Value.(map[string]any)
	entries := fields["GroupSaveDataMap"].([]KV)
	for i, e := range entries {
		if i >= 2 {
			break
		}
		val := e.Value.(map[string]any)
		gt, _ := val["GroupType"].(string)
		rd, _ := val["RawData"].([]byte)
		for j, b := range rd {
			t.Logf("  byte[%2d] = 0x%02x", j, b)
		}
		g, derr := decodeGroup(rd, gt)
		t.Logf("direct decode %d: type=%s len(rd)=%d err=%v result=%+v", i, gt, len(rd), derr, g)
	}

	groups, err := ExtractGroups(context.Background(), raw)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("=== %d groups decoded ===", len(groups))
	for _, g := range groups {
		t.Logf("[%s] id=%s name=%q guildName=%q admin=%s members=%d handles=%d bases=%d campLv=%d",
			g.Type, g.ID, g.Name, g.GuildName, g.AdminPlayerUID, len(g.Members), g.MemberCount, g.BaseCount, g.BaseCampLevel)
		for _, m := range g.Members {
			t.Logf("    member: %s %q online=%s", m.PlayerUID, m.PlayerName, m.LastOnline)
		}
	}
}
