package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"paldeck/internal/docker"
	"paldeck/internal/palworld"
	"paldeck/internal/store"
)

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

// GET /api/servers/{id}/players
func (a *api) players(w http.ResponseWriter, r *http.Request) {
	sv, err := a.st.Get(r.PathValue("id"))
	if err != nil {
		writeErr(w, http.StatusNotFound, "server not found")
		return
	}
	pc := a.pal(sv)
	if pc == nil {
		writeJSON(w, http.StatusOK, map[string]any{"available": false, "players": []any{}})
		return
	}
	list, err := pc.Players(r.Context())
	if err != nil {
		// Server stopped or still booting — an empty, unavailable list, not a 500.
		writeJSON(w, http.StatusOK, map[string]any{"available": false, "players": []any{}})
		return
	}
	if list == nil {
		list = []palworld.Player{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"available": true, "players": list})
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
