package api

import "net/http"

// Spec 007 — surfaces the image's own hourly world backups. List needs no
// exec (tar-walk, same technique as Pal Search); restore stops the server
// (no save — we're deliberately overwriting current state), swaps the world
// files, and leaves it stopped so the operator confirms before playing on it.

// GET /api/servers/{id}/backups
func (a *api) backups(w http.ResponseWriter, r *http.Request) {
	sv, err := a.st.Get(r.PathValue("id"))
	if err != nil {
		writeErr(w, http.StatusNotFound, "server not found")
		return
	}
	if sv.ContainerID == "" {
		writeJSON(w, http.StatusOK, map[string]any{"backups": []any{}})
		return
	}
	list, err := a.dk.ListBackups(r.Context(), sv.ContainerID)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "listing backups: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"backups": list})
}

// POST /api/servers/{id}/backups/{ts}/restore
func (a *api) restoreBackup(w http.ResponseWriter, r *http.Request) {
	sv, err := a.st.Get(r.PathValue("id"))
	if err != nil {
		writeErr(w, http.StatusNotFound, "server not found")
		return
	}
	ts := r.PathValue("ts")
	ctx := r.Context()

	list, err := a.dk.ListBackups(ctx, sv.ContainerID)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "listing backups: "+err.Error())
		return
	}
	var worldID string
	for _, b := range list {
		if b.Timestamp == ts {
			worldID = b.WorldID
			break
		}
	}
	if worldID == "" {
		writeErr(w, http.StatusNotFound, "backup not found")
		return
	}

	if a.dk.Status(ctx, sv.ContainerID) == "running" {
		if err := a.dk.Stop(ctx, sv.ContainerID); err != nil {
			writeErr(w, http.StatusBadGateway, "stop before restore: "+err.Error())
			return
		}
	}
	if err := a.dk.RestoreBackup(ctx, sv.ContainerID, worldID, ts); err != nil {
		writeErr(w, http.StatusInternalServerError, "restore: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "restored — start the server to confirm"})
}
