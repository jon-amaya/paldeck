// Package api is Paldeck's HTTP surface: REST for lifecycle, WebSocket for logs,
// and it serves the embedded console. Uses Go 1.22+ ServeMux method routing —
// no router dependency.
package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io/fs"
	"log"
	"net/http"
	"strings"
	"time"

	"paldeck/internal/docker"
	"paldeck/internal/store"
)

type api struct {
	st *store.Store
	dk *docker.Docker
}

func New(st *store.Store, dk *docker.Docker, web fs.FS) http.Handler {
	a := &api{st: st, dk: dk}
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", a.health)
	mux.HandleFunc("GET /api/servers", a.list)
	mux.HandleFunc("POST /api/servers", a.create)
	mux.HandleFunc("POST /api/servers/{id}/start", a.action(a.dk.Start))
	mux.HandleFunc("POST /api/servers/{id}/stop", a.stop) // saves the world first
	mux.HandleFunc("POST /api/servers/{id}/restart", a.action(a.dk.Restart))
	mux.HandleFunc("DELETE /api/servers/{id}", a.remove)
	mux.HandleFunc("GET /api/servers/{id}/logs", a.logs) // upgrades to WebSocket

	// operator endpoints (spec 003)
	mux.HandleFunc("GET /api/servers/{id}/metrics", a.metrics)
	mux.HandleFunc("GET /api/servers/{id}/players", a.players)
	mux.HandleFunc("POST /api/servers/{id}/broadcast", a.broadcast)
	mux.HandleFunc("POST /api/servers/{id}/players/{uid}/kick", a.playerAction("kick"))
	mux.HandleFunc("POST /api/servers/{id}/players/{uid}/ban", a.playerAction("ban"))
	mux.HandleFunc("GET /api/servers/{id}/pals", a.pals) // save parsing (spec 004)

	// world settings editor (spec 006)
	mux.HandleFunc("GET /api/servers/{id}/settings", a.getSettings)
	mux.HandleFunc("PUT /api/servers/{id}/settings", a.putSettings)
	mux.HandleFunc("POST /api/servers/{id}/recreate", a.recreate)

	// backups (spec 007)
	mux.HandleFunc("GET /api/servers/{id}/backups", a.backups)
	mux.HandleFunc("POST /api/servers/{id}/backups/{ts}/restore", a.restoreBackup)

	// RCON console (spec 009)
	mux.HandleFunc("POST /api/servers/{id}/rcon", a.rconExec)

	mux.Handle("/", http.FileServerFS(web))
	return mux
}

func (a *api) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (a *api) list(w http.ResponseWriter, r *http.Request) {
	servers, err := a.st.List()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	for i := range servers {
		servers[i].Status = a.dk.Status(r.Context(), servers[i].ContainerID)
	}
	writeJSON(w, http.StatusOK, servers)
}

func (a *api) create(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name           string `json:"name"`
		Description    string `json:"description"`
		MaxPlayers     int    `json:"maxPlayers"`
		ServerPassword string `json:"serverPassword"`
		AdminPassword  string `json:"adminPassword"`
		Difficulty     string `json:"difficulty"`
		PvP            bool   `json:"pvp"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	name := sanitizeName(body.Name)
	if name == "" {
		writeErr(w, http.StatusBadRequest, "name is required (letters, numbers, dash)")
		return
	}

	// Normalize settings to values the image accepts (see docker.CreateOpts).
	players := body.MaxPlayers
	if players == 0 {
		players = 16 // default when the client omits it
	}
	if players < 1 {
		players = 1
	} else if players > 99 {
		players = 99
	}
	difficulty := body.Difficulty
	switch difficulty {
	case "None", "Normal", "Difficult":
	default:
		difficulty = "None"
	}
	adminPass := strings.TrimSpace(body.AdminPassword)
	if adminPass == "" {
		adminPass = newSecret() // auto-generate when left blank
	}

	ctx := r.Context()
	if err := a.dk.EnsureImage(ctx); err != nil {
		writeErr(w, http.StatusBadGateway, "pulling Palworld image: "+err.Error())
		return
	}

	// Live host port state — catches a pre-existing, unmanaged container
	// (e.g. a manually-run Palworld server) using the pool's default ports,
	// which Paldeck's own DB has no record of. Best-effort: if this query
	// fails, fall back to Paldeck's own records only rather than blocking
	// creation outright — a.dk.Create below still fails safely if a real
	// collision slips through.
	extraUDP, extraTCP, err := a.dk.UsedHostPorts(ctx)
	if err != nil {
		extraUDP, extraTCP = nil, nil
	}

	// Reserve ports + insert the record atomically FIRST (CreateReserving fills
	// the ports). Then create the container; if that fails, drop the row. The
	// old order (allocate → create container → insert) raced under concurrency.
	sv := store.Server{
		ID:             newID(),
		Name:           name,
		AdminPass:      adminPass,
		Description:    strings.TrimSpace(body.Description),
		MaxPlayers:     players,
		ServerPassword: strings.TrimSpace(body.ServerPassword),
		Difficulty:     difficulty,
		PvP:            body.PvP,
		CreatedAt:      time.Now(),
	}
	if err := a.st.CreateReserving(&sv, extraUDP, extraTCP); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
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
	})
	if err != nil {
		_ = a.st.Delete(sv.ID) // release the reservation
		writeErr(w, http.StatusBadGateway, "creating container: "+err.Error())
		return
	}
	sv.ContainerID = cid

	if err := a.st.SetContainer(sv.ID, cid); err != nil {
		_ = a.dk.Remove(ctx, cid)
		_ = a.st.Delete(sv.ID)
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	sv.Status = "created"
	// The one and only time the admin password leaves the server: the create
	// response. AdminPass itself is json:"-", so list/get never expose it.
	writeJSON(w, http.StatusCreated, struct {
		store.Server
		AdminPassword string `json:"adminPassword"`
	}{sv, adminPass})
}

// action wraps the three identical start/stop/restart handlers.
func (a *api) action(fn func(context.Context, string) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sv, err := a.st.Get(r.PathValue("id"))
		if err != nil {
			writeErr(w, http.StatusNotFound, "server not found")
			return
		}
		if err := fn(r.Context(), sv.ContainerID); err != nil {
			writeErr(w, http.StatusBadGateway, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": a.dk.Status(r.Context(), sv.ContainerID)})
	}
}

func (a *api) remove(w http.ResponseWriter, r *http.Request) {
	sv, err := a.st.Get(r.PathValue("id"))
	if err != nil {
		writeErr(w, http.StatusNotFound, "server not found")
		return
	}
	if sv.ContainerID != "" {
		if err := a.dk.Remove(r.Context(), sv.ContainerID); err != nil {
			log.Printf("remove container %s: %v", sv.ContainerID, err)
		}
	}
	if err := a.st.Delete(sv.ID); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- helpers ----

func newID() string     { return randHex(6) }
func newSecret() string { return randHex(18) }

func randHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func sanitizeName(s string) string {
	s = strings.TrimSpace(s)
	var b strings.Builder
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_':
			b.WriteRune(r)
		case r == ' ':
			b.WriteRune('-')
		}
	}
	name := b.String()
	if len(name) > 40 {
		name = name[:40]
	}
	return name
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}
