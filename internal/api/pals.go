package api

import (
	"net/http"
	"sync"
	"time"

	"paldeck/internal/palsave"
)

// GET /api/servers/{id}/pals — read the world save from the container volume,
// decompress (WASM Oodle), parse GVAS, extract Pals. Works for stopped servers
// too (last save). For running servers with REST, trigger a save first so the
// list is current. Parsing costs ~100ms; a short TTL cache absorbs UI refreshes.

type palsCacheEntry struct {
	at   time.Time
	pals []palsave.Pal
}

var (
	palsMu    sync.Mutex
	palsCache = map[string]palsCacheEntry{}
)

func (a *api) pals(w http.ResponseWriter, r *http.Request) {
	sv, err := a.st.Get(r.PathValue("id"))
	if err != nil {
		writeErr(w, http.StatusNotFound, "server not found")
		return
	}
	if sv.ContainerID == "" {
		writeErr(w, http.StatusConflict, "server has no container")
		return
	}
	ctx := r.Context()

	palsMu.Lock()
	if c, ok := palsCache[sv.ID]; ok && time.Since(c.at) < 30*time.Second {
		palsMu.Unlock()
		writeJSON(w, http.StatusOK, map[string]any{"pals": c.pals, "cachedAt": c.at})
		return
	}
	palsMu.Unlock()

	// freshness: ask the running server to flush the world to disk first
	if pc := a.pal(sv); pc != nil && a.dk.Status(ctx, sv.ContainerID) == "running" {
		if err := pc.Save(ctx); err == nil {
			time.Sleep(1500 * time.Millisecond)
		}
	}

	sav, err := a.dk.ReadWorldLevelSav(ctx, sv.ContainerID)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "reading world save: "+err.Error())
		return
	}
	raw, decErr := palsave.Decompress(ctx, sav)
	for attempt := 0; decErr != nil && attempt < 2; attempt++ {
		// CopyFromContainer streams whatever bytes are on disk with no
		// coordination with Palworld's own writer — reading mid-autosave
		// tears the compressed stream (valid header, incomplete payload),
		// which the WASM decompressor sees as corrupt input. The write
		// finishes within a second or two, so a fresh copy self-corrects.
		time.Sleep(time.Second)
		if sav, err = a.dk.ReadWorldLevelSav(ctx, sv.ContainerID); err != nil {
			writeErr(w, http.StatusBadGateway, "reading world save: "+err.Error())
			return
		}
		raw, decErr = palsave.Decompress(ctx, sav)
	}
	if decErr != nil {
		writeErr(w, http.StatusInternalServerError, "decompress: "+decErr.Error())
		return
	}
	pals, err := palsave.ExtractPals(ctx, raw)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "parse: "+err.Error())
		return
	}

	now := time.Now()
	palsMu.Lock()
	palsCache[sv.ID] = palsCacheEntry{at: now, pals: pals}
	palsMu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"pals": pals, "cachedAt": now})
}
