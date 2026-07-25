package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"paldeck/internal/docker"
	"paldeck/internal/rcon"
)

// POST /api/servers/{id}/rcon {"command": "..."} — raw Source RCON exec.
// One connection per call; RCON here is an occasional admin action.
func (a *api) rconExec(w http.ResponseWriter, r *http.Request) {
	sv, err := a.st.Get(r.PathValue("id"))
	if err != nil {
		writeErr(w, http.StatusNotFound, "server not found")
		return
	}
	if a.dk.Status(r.Context(), sv.ContainerID) != "running" {
		writeErr(w, http.StatusConflict, "server is not running")
		return
	}
	var body struct {
		Command string `json:"command"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Command) == "" {
		writeErr(w, http.StatusBadRequest, "command is required")
		return
	}

	// RCON_PORT is set to sv.RconPort *inside* the container too (unlike
	// REST, there's no separate fixed-internal-vs-published-host split for
	// RCON — see docker.go), so the container-name address uses the real
	// value, not a constant.
	c, err := rcon.Dial(r.Context(), fmt.Sprintf("%s:%d", docker.ContainerName(sv.Name), sv.RconPort), sv.AdminPass)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "rcon connect: "+err.Error())
		return
	}
	defer c.Close()

	out, err := c.Exec(strings.TrimSpace(body.Command))
	if err != nil {
		writeErr(w, http.StatusBadGateway, "rcon exec: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"output": out})
}
