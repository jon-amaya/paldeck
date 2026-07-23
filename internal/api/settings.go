package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"paldeck/internal/docker"
)

// Spec 006 — world settings editor. Settings persist in the DB; applying them
// recreates the container with new env on the same volume + ports (worlds
// survive recreation by design).

// allowedEnv is the write allowlist of image env vars the editor may set.
// Names follow thijsvanloef/palworld-server-docker's documented table; the
// first live apply validates them against the compiled ini (T-402).
var allowedEnv = map[string]bool{
	"EXP_RATE": true, "PAL_CAPTURE_RATE": true, "PAL_SPAWN_NUM_RATE": true,
	"WORK_SPEED_RATE": true, "DAYTIME_SPEEDRATE": true, "NIGHTTIME_SPEEDRATE": true,
	"PAL_EGG_DEFAULT_HATCHING_TIME": true, "DEATH_PENALTY": true,
	"PAL_DAMAGE_RATE_ATTACK": true, "PAL_DAMAGE_RATE_DEFENSE": true,
	"PLAYER_DAMAGE_RATE_ATTACK": true, "PLAYER_DAMAGE_RATE_DEFENSE": true,
	"PLAYER_STOMACH_DECREASE_RATE": true, "PLAYER_STAMINA_DECREASE_RATE": true,
	"PLAYER_AUTO_HP_REGEN_RATE": true, "PLAYER_AUTO_HP_REGEN_RATE_IN_SLEEP": true,
	"PAL_STOMACH_DECREASE_RATE": true, "PAL_STAMINA_DECREASE_RATE": true,
	"PAL_AUTO_HP_REGEN_RATE": true, "PAL_AUTO_HP_REGEN_RATE_IN_SLEEP": true,
	"BUILD_OBJECT_DAMAGE_RATE": true, "BUILD_OBJECT_DETERIORATION_DAMAGE_RATE": true,
	"COLLECTION_DROP_RATE": true, "COLLECTION_OBJECT_HP_RATE": true,
	"COLLECTION_OBJECT_RESPAWN_SPEED_RATE": true, "ENEMY_DROP_ITEM_RATE": true,
	"ENABLE_FAST_TRAVEL": true, "ENABLE_INVADER_ENEMY": true,
	"ENABLE_PLAYER_TO_PLAYER_DAMAGE": true, "ENABLE_FRIENDLY_FIRE": true,
	"IS_START_LOCATION_SELECT_BY_MAP": true, "EXIST_PLAYER_AFTER_LOGOUT": true,
	"BASE_CAMP_MAX_NUM": true, "BASE_CAMP_WORKER_MAX_NUM": true,
	"DROP_ITEM_MAX_NUM": true, "DROP_ITEM_ALIVE_MAX_HOURS": true,
	"GUILD_PLAYER_MAX_NUM": true, "AUTO_RESET_GUILD_NO_ONLINE_PLAYERS": true,
	"AUTO_RESET_GUILD_TIME_NO_ONLINE_PLAYERS": true,
	"CAN_PICKUP_OTHER_GUILD_DEATH_PENALTY_DROP": true,
	"ENABLE_NON_LOGIN_PENALTY": true,
}

// GET /api/servers/{id}/settings
func (a *api) getSettings(w http.ResponseWriter, r *http.Request) {
	sv, err := a.st.Get(r.PathValue("id"))
	if err != nil {
		writeErr(w, http.StatusNotFound, "server not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"description":   sv.Description,
		"maxPlayers":    sv.MaxPlayers,
		"difficulty":    sv.Difficulty,
		"pvp":           sv.PvP,
		"hasPassword":   sv.ServerPassword != "",
		"worldSettings": sv.WorldSettings,
	})
}

// PUT /api/servers/{id}/settings — persists; takes effect on Apply (recreate).
func (a *api) putSettings(w http.ResponseWriter, r *http.Request) {
	sv, err := a.st.Get(r.PathValue("id"))
	if err != nil {
		writeErr(w, http.StatusNotFound, "server not found")
		return
	}
	var body struct {
		Description    *string           `json:"description"`
		MaxPlayers     *int              `json:"maxPlayers"`
		ServerPassword *string           `json:"serverPassword"` // null = keep
		Difficulty     *string           `json:"difficulty"`
		PvP            *bool             `json:"pvp"`
		World          map[string]string `json:"worldSettings"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if body.Description != nil {
		sv.Description = strings.TrimSpace(*body.Description)
	}
	if body.MaxPlayers != nil {
		p := *body.MaxPlayers
		if p < 1 {
			p = 1
		} else if p > 99 {
			p = 99
		}
		sv.MaxPlayers = p
	}
	if body.ServerPassword != nil {
		sv.ServerPassword = strings.TrimSpace(*body.ServerPassword)
	}
	if body.Difficulty != nil {
		switch *body.Difficulty {
		case "None", "Normal", "Difficult":
			sv.Difficulty = *body.Difficulty
		}
	}
	if body.PvP != nil {
		sv.PvP = *body.PvP
	}
	if body.World != nil {
		clean := map[string]string{}
		for k, v := range body.World {
			k = strings.ToUpper(strings.TrimSpace(k))
			v = strings.TrimSpace(v)
			if !allowedEnv[k] {
				writeErr(w, http.StatusBadRequest, "unknown setting: "+k)
				return
			}
			if len(v) > 64 {
				writeErr(w, http.StatusBadRequest, "value too long for "+k)
				return
			}
			if v != "" {
				clean[k] = v
			}
		}
		sv.WorldSettings = clean
	}
	if err := a.st.UpdateSettings(sv); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "saved — apply to take effect"})
}

// POST /api/servers/{id}/recreate — apply settings: graceful stop, remove the
// container (volume kept), create with fresh env, start again if it was running.
func (a *api) recreate(w http.ResponseWriter, r *http.Request) {
	sv, err := a.st.Get(r.PathValue("id"))
	if err != nil {
		writeErr(w, http.StatusNotFound, "server not found")
		return
	}
	ctx := r.Context()
	wasRunning := a.dk.Status(ctx, sv.ContainerID) == "running"

	if wasRunning {
		if pc := a.pal(sv); pc != nil {
			_ = pc.Save(ctx) // best-effort world flush before the stop
		}
		if err := a.dk.Stop(ctx, sv.ContainerID); err != nil {
			writeErr(w, http.StatusBadGateway, "stop: "+err.Error())
			return
		}
	}
	if sv.ContainerID != "" {
		if err := a.dk.Remove(ctx, sv.ContainerID); err != nil {
			writeErr(w, http.StatusBadGateway, "remove: "+err.Error())
			return
		}
	}

	cid, err := a.dk.Create(ctx, docker.CreateOpts{
		Name:           sv.Name,
		GamePort:       sv.GamePort,
		QueryPort:      sv.QueryPort,
		RconPort:       sv.RconPort,
		RestPort:       sv.RestPort,
		AdminPass:      sv.AdminPass,
		Volume:         "paldeck-" + sv.ID,
		Description:    sv.Description,
		MaxPlayers:     sv.MaxPlayers,
		ServerPassword: sv.ServerPassword,
		Difficulty:     sv.Difficulty,
		PvP:            sv.PvP,
		Extra:          sv.WorldSettings,
	})
	if err != nil {
		writeErr(w, http.StatusBadGateway, "recreate: "+err.Error())
		return
	}
	if err := a.st.SetContainer(sv.ID, cid); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if wasRunning {
		if err := a.dk.Start(ctx, cid); err != nil {
			writeErr(w, http.StatusBadGateway, "start: "+err.Error())
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":     a.dk.Status(ctx, cid),
		"wasRunning": wasRunning,
	})
}
