package palsave

// Layer 3: turn the parsed tree into Pals. Field names verified against a real
// world (specs/004): struct PalIndividualCharacterSaveParameter.

import (
	"context"
	"fmt"
	"strings"
)

type Pal struct {
	InstanceID    string   `json:"instanceId"`
	Species       string   `json:"species"` // CharacterID, e.g. "Penguin"
	NickName      string   `json:"nickName"`
	Level         int      `json:"level"`
	Gender        string   `json:"gender"`
	IsPlayer      bool     `json:"isPlayer"`
	TalentHP      int      `json:"talentHp"`
	TalentMelee   int      `json:"talentMelee"`
	TalentShot    int      `json:"talentShot"`
	TalentDefense int      `json:"talentDefense"`
	Passives      []string `json:"passives"`
	OwnerUID      string   `json:"ownerUid"`
	OwnerName     string   `json:"ownerName"`

	Exp            int      `json:"exp"`
	Rank           int      `json:"rank"`       // star rank: 1 base, up to 5 condensed
	RankHP         int      `json:"rankHp"`     // soul enhancements
	RankAttack     int      `json:"rankAttack"`
	RankDefense    int      `json:"rankDefense"`
	RankCraftSpeed int      `json:"rankCraftSpeed"`
	IsLucky        bool     `json:"isLucky"` // rare/lucky pal ✨
	Friendship     int      `json:"friendship"`
	MovesEquipped  []string `json:"movesEquipped"`
	MovesMastered  []string `json:"movesMastered"`
}

func wazaList(v any) []string {
	list, _ := v.([]string)
	out := make([]string, 0, len(list))
	for _, w := range list {
		if i := strings.LastIndex(w, "::"); i >= 0 {
			w = w[i+2:]
		}
		out = append(out, w)
	}
	return out
}

func toInt(v any) int {
	switch x := v.(type) {
	case int32:
		return int(x)
	case int64:
		return int(x)
	case uint32:
		return int(x)
	case uint64:
		return int(x)
	case byte:
		return int(x)
	default:
		return 0
	}
}

func str(v any) string {
	s, _ := v.(string)
	return s
}

func enumTail(v any) string {
	s := str(v)
	if i := strings.LastIndex(s, "::"); i >= 0 {
		return s[i+2:]
	}
	return s
}

func guidOf(v any) string {
	if sv, ok := v.(StructVal); ok {
		if s, ok := sv.Value.(string); ok {
			return s
		}
	}
	return ""
}

// ExtractPals parses a decompressed GVAS body's character map into Pals
// (players included, flagged IsPlayer so the UI can separate them).
func ExtractPals(ctx context.Context, raw []byte) ([]Pal, error) {
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
	entries, ok := fields["CharacterSaveParameterMap"].([]KV)
	if !ok {
		return nil, fmt.Errorf("CharacterSaveParameterMap missing (%T)", fields["CharacterSaveParameterMap"])
	}

	pals := make([]Pal, 0, len(entries))
	for _, e := range entries {
		key, _ := e.Key.(map[string]any)
		val, _ := e.Value.(map[string]any)
		if key == nil || val == nil {
			continue
		}
		rd, _ := val["RawData"].([]byte)
		if len(rd) == 0 {
			continue
		}
		inner, err := ParseBody(rd, 0)
		if err != nil {
			continue // one broken character shouldn't sink the list
		}
		spv, ok := inner["SaveParameter"].(StructVal)
		if !ok {
			continue
		}
		sp, ok := spv.Value.(map[string]any)
		if !ok {
			continue
		}

		p := Pal{
			InstanceID: guidOf(key["InstanceId"]),
			Species:    str(sp["CharacterID"]),
			NickName:   str(sp["NickName"]),
			Gender:     enumTail(sp["Gender"]),
			Level:      1,
		}
		if lv, ok := sp["Level"]; ok {
			p.Level = toInt(lv)
		}
		if b, ok := sp["IsPlayer"].(bool); ok {
			p.IsPlayer = b
		}
		p.TalentHP = toInt(sp["Talent_HP"])
		p.TalentMelee = toInt(sp["Talent_Melee"])
		p.TalentShot = toInt(sp["Talent_Shot"])
		p.TalentDefense = toInt(sp["Talent_Defense"])
		if list, ok := sp["PassiveSkillList"].([]string); ok {
			p.Passives = list
		} else {
			p.Passives = []string{}
		}
		p.OwnerUID = guidOf(sp["OwnerPlayerUId"])
		p.Exp = toInt(sp["Exp"])
		p.Rank = toInt(sp["Rank"])
		if p.Rank == 0 {
			p.Rank = 1
		}
		p.RankHP = toInt(sp["Rank_HP"])
		p.RankAttack = toInt(sp["Rank_Attack"])
		p.RankDefense = toInt(sp["Rank_Defence"]) // the game spells it "Defence"
		p.RankCraftSpeed = toInt(sp["Rank_CraftSpeed"])
		if b, ok := sp["IsRarePal"].(bool); ok {
			p.IsLucky = b
		}
		p.Friendship = toInt(sp["FriendshipPoint"])
		p.MovesEquipped = wazaList(sp["EquipWaza"])
		p.MovesMastered = wazaList(sp["MasteredWaza"])
		pals = append(pals, p)
	}

	// second pass: owner names — players are indexed by their key's PlayerUId,
	// which matches the pals' OwnerPlayerUId (same on-disk encoding).
	byUID := map[string]string{}
	for _, e := range entries {
		key, _ := e.Key.(map[string]any)
		if key == nil {
			continue
		}
		uid := guidOf(key["PlayerUId"])
		if uid == "" || uid == strings.Repeat("0", 32) {
			continue
		}
		val, _ := e.Value.(map[string]any)
		rd, _ := val["RawData"].([]byte)
		if len(rd) == 0 {
			continue
		}
		if inner, err := ParseBody(rd, 0); err == nil {
			if spv, ok := inner["SaveParameter"].(StructVal); ok {
				if sp, ok := spv.Value.(map[string]any); ok {
					if n := str(sp["NickName"]); n != "" {
						byUID[uid] = n
					}
				}
			}
		}
	}
	for i := range pals {
		if n, ok := byUID[pals[i].OwnerUID]; ok {
			pals[i].OwnerName = n
		}
	}
	return pals, nil
}
