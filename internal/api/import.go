package api

import (
	"encoding/json"
	"net/http"
)

// Import: bring an existing, unmanaged Palworld container's world into a
// brand-new Paldeck-created server. Never touches the source — the new
// server goes through the exact same POST /api/servers flow as any other
// server, and import-save just copies the world tree in afterward, before
// its first start. Deliberately not "adopt this container in place" (a
// different, riskier feature — the source may use a bind mount and a
// container name Paldeck's own recreate logic doesn't know how to
// preserve); see specs/002-react-console/tasks.md for why that was
// descoped.

// GET /api/import-candidates
func (a *api) importCandidates(w http.ResponseWriter, r *http.Request) {
	list, err := a.dk.ImportCandidates(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadGateway, "listing import candidates: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"candidates": list})
}

// POST /api/servers/{id}/import-save {"sourceContainerId": "..."}
// Meant to run once, right after creating a server, before its first start
// — refuses if the target is already running, since importing into a world
// that's already live would silently clobber it.
func (a *api) importSave(w http.ResponseWriter, r *http.Request) {
	sv, err := a.st.Get(r.PathValue("id"))
	if err != nil {
		writeErr(w, http.StatusNotFound, "server not found")
		return
	}
	var body struct {
		SourceContainerID string `json:"sourceContainerId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.SourceContainerID == "" {
		writeErr(w, http.StatusBadRequest, "sourceContainerId is required")
		return
	}
	ctx := r.Context()
	if a.dk.Status(ctx, sv.ContainerID) == "running" {
		writeErr(w, http.StatusConflict, "stop the server before importing a save into it")
		return
	}
	if err := a.dk.ImportSave(ctx, body.SourceContainerID, sv.ContainerID); err != nil {
		writeErr(w, http.StatusBadGateway, "import: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "imported — start the server to confirm"})
}
