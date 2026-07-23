package palsave

// Guild/group data: GroupSaveDataMap's RawData is NOT a UE property list (unlike
// character RawData) — it's Palworld's own compact binary struct
// (FPalGroupSaveDataParameters). Layout confirmed against the community
// reference implementation (cheahjs/palworld-save-tools, rawdata/group.go),
// not guessed: guid → fstring name → tarray(guid+guid) member handles →
// [Guild/IndependentGuild/Organization: byte org_type, tarray(guid) base ids]
// → [Guild/IndependentGuild only: i32 base camp level, tarray(guid) points,
// fstring guild name] → per-type player list.

import (
	"context"
	"fmt"
	"time"
)

type GroupMember struct {
	PlayerUID  string    `json:"playerUid"`
	PlayerName string    `json:"playerName"`
	LastOnline time.Time `json:"lastOnline"`
}

type Group struct {
	ID             string        `json:"id"`
	Type           string        `json:"type"` // Guild | IndependentGuild | Organization | other
	Name           string        `json:"name"`
	GuildName      string        `json:"guildName"`
	BaseCampLevel  int           `json:"baseCampLevel"`
	AdminPlayerUID string        `json:"adminPlayerUid"`
	Members        []GroupMember `json:"members"`
	MemberCount    int           `json:"memberCount"` // handle-list length: players + pals belonging to the group
	BaseCount      int           `json:"baseCount"`
}

// .NET ticks (100ns units since 0001-01-01) → time.Time. The same encoding as
// the character OwnedTime field seen elsewhere in the save.
const dotnetEpochOffsetTicks = 621355968000000000

func ticksToTime(ticks int64) time.Time {
	if ticks <= 0 {
		return time.Time{}
	}
	return time.Unix(0, (ticks-dotnetEpochOffsetTicks)*100).UTC()
}

func decodeGroup(raw []byte, groupType string) (g Group, err error) {
	defer func() {
		if p := recover(); p != nil {
			if pe, ok := p.(parseErr); ok {
				err = pe
				return
			}
			panic(p)
		}
	}()
	r := &reader{b: raw}
	g.Type = enumTail(groupType)
	g.ID = r.guid()
	g.Name = r.fstring()

	// individual_character_handle_ids: tarray of {guid, instance_id guid} = 32B each
	n := int(r.u32())
	if n > 1_000_000 {
		r.fail("implausible member-handle count %d", n)
	}
	r.need(n * 32)
	g.MemberCount = n

	switch g.Type {
	case "Guild", "IndependentGuild", "Organization":
		_ = r.u8() // org_type
		bn := int(r.u32())
		if bn > 1_000_000 {
			r.fail("implausible base-id count %d", bn)
		}
		r.need(bn * 16)
		g.BaseCount = bn
	}

	switch g.Type {
	case "Guild", "IndependentGuild":
		g.BaseCampLevel = int(r.i32())
		pn := int(r.u32())
		if pn > 1_000_000 {
			r.fail("implausible base-camp-point count %d", pn)
		}
		r.need(pn * 16)
		g.GuildName = r.fstring()
	}

	switch g.Type {
	case "IndependentGuild":
		// a solo "guild" — one player, no roster to loop
		g.AdminPlayerUID = r.guid()
		_ = r.fstring() // duplicate guild name
		last := r.i64()
		name := r.fstring()
		g.Members = []GroupMember{{PlayerUID: g.AdminPlayerUID, PlayerName: name, LastOnline: ticksToTime(last)}}
	case "Guild":
		g.AdminPlayerUID = r.guid()
		pc := int(r.i32())
		if pc > 100_000 {
			r.fail("implausible player count %d", pc)
		}
		g.Members = make([]GroupMember, 0, pc)
		for i := 0; i < pc; i++ {
			uid := r.guid()
			last := r.i64()
			name := r.fstring()
			g.Members = append(g.Members, GroupMember{PlayerUID: uid, PlayerName: name, LastOnline: ticksToTime(last)})
		}
	}
	return g, nil
}

// ExtractGroups parses a decompressed GVAS body's GroupSaveDataMap into
// guilds/organizations. "Organization" entries are auto-created solo
// containers Palworld makes per player who hasn't joined a guild — the UI
// should generally show only Guild/IndependentGuild as "guilds".
func ExtractGroups(ctx context.Context, raw []byte) ([]Group, error) {
	h, err := ParseHeader(raw)
	if err != nil {
		return nil, err
	}
	body, err := ParseBody(raw, h.BodyOffset)
	if err != nil {
		return nil, err
	}
	wsd, ok := body["worldSaveData"].(StructVal)
	if !ok {
		return nil, fmt.Errorf("no worldSaveData")
	}
	fields, ok := wsd.Value.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("worldSaveData is not a property list")
	}
	entries, ok := fields["GroupSaveDataMap"].([]KV)
	if !ok {
		return nil, fmt.Errorf("GroupSaveDataMap missing (%T)", fields["GroupSaveDataMap"])
	}

	out := make([]Group, 0, len(entries))
	for _, e := range entries {
		val, _ := e.Value.(map[string]any)
		if val == nil {
			continue
		}
		groupType, _ := val["GroupType"].(string)
		rd, _ := val["RawData"].([]byte)
		if len(rd) == 0 {
			continue
		}
		g, err := decodeGroup(rd, groupType)
		if err != nil {
			continue // one bad group shouldn't sink the whole list
		}
		out = append(out, g)
	}
	return out, nil
}
