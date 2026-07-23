package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

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

	c, err := rcon.Dial(r.Context(), fmt.Sprintf("127.0.0.1:%d", sv.RconPort), sv.AdminPass)
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
