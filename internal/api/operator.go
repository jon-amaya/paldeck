package api

import (
	"encoding/json"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"paldeck/internal/docker"
	"paldeck/internal/palsave"
	"paldeck/internal/palworld"
	"paldeck/internal/store"
)

// Real player UIDs are 32 hex chars (e.g. "D2C229A3000000000000000000000000").
// REST occasionally reports playerId as the literal string "None" — Unreal's
// stringified-uninitialized-FName — for a player who's still mid-connect and
// whose id hasn't been populated yet. Without this guard that garbage value
// gets treated as a real UID and remembered permanently, creating a
// duplicate "offline" ghost of someone who's actually online.
var validPlayerID = regexp.MustCompile(`^[0-9A-Fa-f]{32}$`)

// Operator endpoints (spec 003): live metrics, players, broadcast, kick/ban.
// The Go backend makes all Palworld REST calls — the admin password never
// reaches the browser. Every Palworld-derived field is optional: servers
// created before the REST plumbing (RestPort == 0), or servers still booting,
// simply omit those fields and the UI shows "—".

func (a *api) pal(sv store.Server) *palworld.Client {
	if sv.RestPort == 0 {
		return nil
	}
	return palworld.New(docker.ContainerName(sv.Name), sv.AdminPass)
}

// GET /api/servers/{id}/metrics
//
// The four calls below (uptime, docker stats, palworld metrics, palworld
// info) are entirely independent of each other — each is its own Docker API
// or Palworld REST round-trip. Run one after another and their latencies
// simply add up (this used to be sequential and was visibly laggy — each
// poll paid for every call's latency in series); run concurrently and the
// whole request takes roughly as long as the single slowest call instead.
func (a *api) metrics(w http.ResponseWriter, r *http.Request) {
	sv, err := a.st.Get(r.PathValue("id"))
	if err != nil {
		writeErr(w, http.StatusNotFound, "server not found")
		return
	}
	ctx := r.Context()
	status := a.dk.Status(ctx, sv.ContainerID)
	resp := map[string]any{
		"status":        status,
		"restAvailable": sv.RestPort > 0,
	}
	if status == "running" {
		var (
			wg         sync.WaitGroup
			uptimeSec  int
			hasUptime  bool
			stats      docker.StatsSnapshot
			hasStats   bool
			metrics    palworld.Metrics
			hasMetrics bool
			info       palworld.Info
			hasInfo    bool
		)
		pc := a.pal(sv)

		wg.Add(1)
		go func() {
			defer wg.Done()
			if t, err := a.dk.StartedAt(ctx, sv.ContainerID); err == nil && !t.IsZero() {
				uptimeSec, hasUptime = int(time.Since(t).Seconds()), true
			}
		}()

		wg.Add(1)
		go func() {
			defer wg.Done()
			if st, err := a.dk.Stats(ctx, sv.ContainerID); err == nil {
				stats, hasStats = st, true
			}
		}()

		if pc != nil {
			wg.Add(2)
			go func() {
				defer wg.Done()
				if m, err := pc.Metrics(ctx); err == nil {
					metrics, hasMetrics = m, true
				}
			}()
			go func() {
				defer wg.Done()
				if inf, err := pc.Info(ctx); err == nil {
					info, hasInfo = inf, true
				}
			}()
		}

		wg.Wait()

		if hasUptime {
			resp["uptimeSec"] = uptimeSec
		}
		if hasStats {
			resp["cpuPercent"] = stats.CPUPercent
			resp["memUsed"] = stats.MemUsed
			resp["memLimit"] = stats.MemLimit
		}
		if hasMetrics {
			resp["players"] = metrics.CurrentPlayerNum
			resp["maxPlayers"] = metrics.MaxPlayerNum
			resp["fps"] = metrics.ServerFPS
			resp["day"] = metrics.Days
		}
		if hasInfo {
			resp["version"] = info.Version
		}
	}
	writeJSON(w, http.StatusOK, resp)
}

// PlayerEntry is one row of GET /api/servers/{id}/players — either someone
// currently online (full REST fields) or someone who isn't right now but
// has been before, shown with whatever's known about when. UserID is only
// ever populated for people Paldeck has directly observed online (see
// store.PlayerIdentity) — the save itself never carries a Steam id, so an
// entry without one can be shown but not banned until they reconnect once.
type PlayerEntry struct {
	Name      string    `json:"name"`
	PlayerID  string    `json:"playerId"`
	UserID    string    `json:"userId,omitempty"`
	Online    bool      `json:"online"`
	IP        string    `json:"ip,omitempty"`
	Ping      float64   `json:"ping,omitempty"`
	LocationX float64   `json:"location_x,omitempty"`
	LocationY float64   `json:"location_y,omitempty"`
	Level     int       `json:"level,omitempty"`
	LastSeen  time.Time `json:"lastSeen,omitzero"`
}

// GET /api/servers/{id}/players — merges three sources: who's online right
// now (REST), everyone Paldeck has directly seen online before (its own
// remembered identities, the only source with a banable Steam id), and the
// save's own guild data (LastOnline per player, covering people Paldeck
// never happened to observe live — e.g. anyone who last played before this
// existed). A player who's offline still shows up instead of disappearing
// the moment they disconnect.
func (a *api) players(w http.ResponseWriter, r *http.Request) {
	sv, err := a.st.Get(r.PathValue("id"))
	if err != nil {
		writeErr(w, http.StatusNotFound, "server not found")
		return
	}
	ctx := r.Context()
	byUID := map[string]*PlayerEntry{}

	restOK := false
	if pc := a.pal(sv); pc != nil {
		if list, err := pc.Players(ctx); err == nil {
			restOK = true
			now := time.Now()
			for _, p := range list {
				if !validPlayerID.MatchString(p.PlayerID) {
					continue // mid-connect placeholder ("None") — real id shows up on the next poll
				}
				uid := strings.ToLower(p.PlayerID) // REST uppercases; the save's own guid() encoding is lowercase
				byUID[uid] = &PlayerEntry{
					Name: p.Name, PlayerID: p.PlayerID, UserID: p.UserID, Online: true,
					IP: p.IP, Ping: p.Ping, LocationX: p.LocationX, LocationY: p.LocationY, Level: p.Level,
					LastSeen: now,
				}
				_ = a.st.RememberPlayer(sv.ID, uid, p.UserID, p.Name, now)
			}
		}
	}

	if identities, err := a.st.PlayerIdentities(sv.ID); err == nil {
		for uid, id := range identities {
			if !validPlayerID.MatchString(uid) {
				continue // guards against any bad row from before this validation existed
			}
			if _, ok := byUID[uid]; ok {
				continue // already have the live entry, which is always fresher
			}
			byUID[uid] = &PlayerEntry{Name: id.Name, PlayerID: uid, UserID: id.UserID, Online: false, LastSeen: id.LastSeen}
		}
	}

	if sv.ContainerID != "" {
		if sav, err := a.dk.ReadWorldLevelSav(ctx, sv.ContainerID); err == nil {
			if raw, err := palsave.Decompress(ctx, sav); err == nil {
				if groups, err := palsave.ExtractGroups(ctx, raw); err == nil {
					for _, g := range groups {
						if g.Type != "Guild" && g.Type != "IndependentGuild" {
							continue
						}
						for _, m := range g.Members {
							uid := strings.ToLower(m.PlayerUID)
							if uid == "" {
								continue
							}
							if e, ok := byUID[uid]; ok {
								if e.LastSeen.IsZero() && !m.LastOnline.IsZero() {
									e.LastSeen = m.LastOnline // fill a gap only, never downgrade a fresher record
								}
								continue
							}
							if m.LastOnline.IsZero() {
								continue
							}
							byUID[uid] = &PlayerEntry{Name: m.PlayerName, PlayerID: uid, Online: false, LastSeen: m.LastOnline}
						}
					}
				}
			}
		}
	}

	out := make([]PlayerEntry, 0, len(byUID))
	for _, e := range byUID {
		out = append(out, *e)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Online != out[j].Online {
			return out[i].Online
		}
		return out[i].LastSeen.After(out[j].LastSeen)
	})

	writeJSON(w, http.StatusOK, map[string]any{"available": restOK || len(out) > 0, "players": out})
}

// POST /api/servers/{id}/broadcast  {"message": "..."}
func (a *api) broadcast(w http.ResponseWriter, r *http.Request) {
	sv, err := a.st.Get(r.PathValue("id"))
	if err != nil {
		writeErr(w, http.StatusNotFound, "server not found")
		return
	}
	var body struct {
		Message string `json:"message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Message) == "" {
		writeErr(w, http.StatusBadRequest, "message is required")
		return
	}
	pc := a.pal(sv)
	if pc == nil {
		writeErr(w, http.StatusConflict, "this server has no REST API port — recreate it to enable operator actions")
		return
	}
	if err := pc.Announce(r.Context(), strings.TrimSpace(body.Message)); err != nil {
		writeErr(w, http.StatusBadGateway, "broadcast failed (is the server running?): "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "sent"})
}

// POST /api/servers/{id}/players/{uid}/kick | /ban
func (a *api) playerAction(kind string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sv, err := a.st.Get(r.PathValue("id"))
		if err != nil {
			writeErr(w, http.StatusNotFound, "server not found")
			return
		}
		uid := r.PathValue("uid")
		if uid == "" {
			writeErr(w, http.StatusBadRequest, "player id required")
			return
		}
		pc := a.pal(sv)
		if pc == nil {
			writeErr(w, http.StatusConflict, "this server has no REST API port — recreate it to enable operator actions")
			return
		}
		var body struct {
			Message string `json:"message"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body) // message optional
		msg := body.Message
		if msg == "" {
			msg = "You have been " + kind + "ed by an operator."
		}
		var aerr error
		if kind == "kick" {
			aerr = pc.Kick(r.Context(), uid, msg)
		} else {
			aerr = pc.Ban(r.Context(), uid, msg)
		}
		if aerr != nil {
			writeErr(w, http.StatusBadGateway, kind+" failed: "+aerr.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": kind + "ed"})
	}
}

// stop replaces the generic stop action: ask Palworld to save the world first
// (best effort, short wait), then do the graceful container stop. Closes the
// exit-137 "did it save?" gap properly (T-013).
func (a *api) stop(w http.ResponseWriter, r *http.Request) {
	sv, err := a.st.Get(r.PathValue("id"))
	if err != nil {
		writeErr(w, http.StatusNotFound, "server not found")
		return
	}
	ctx := r.Context()
	if pc := a.pal(sv); pc != nil && a.dk.Status(ctx, sv.ContainerID) == "running" {
		if err := pc.Save(ctx); err == nil {
			time.Sleep(2 * time.Second) // give the save a moment to hit disk
		}
	}
	if err := a.dk.Stop(ctx, sv.ContainerID); err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": a.dk.Status(ctx, sv.ContainerID)})
}
