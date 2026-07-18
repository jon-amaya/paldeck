// Paldeck — a small Palworld server control panel.
// One Go binary: HTTP API + WebSocket log stream, driving Docker, backed by SQLite.
package main

import (
	"context"
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"paldeck/internal/api"
	"paldeck/internal/docker"
	"paldeck/internal/store"
)

// The production frontend: `npm run build` in frontend/ writes dist/, and the
// binary carries it — one deployable file. (Dev uses Vite on :5173 instead.)
//
//go:embed all:frontend/dist
var webRoot embed.FS

func main() {
	addr := envOr("PALDECK_ADDR", ":8080")
	dbPath := envOr("PALDECK_DB", "paldeck.db")

	st, err := store.Open(dbPath)
	if err != nil {
		log.Fatalf("store: %v", err)
	}
	defer st.Close()

	dk, err := docker.New()
	if err != nil {
		log.Fatalf("docker: %v (is the Docker daemon running? check /var/run/docker.sock or DOCKER_HOST)", err)
	}
	defer dk.Close()

	webFS, _ := fs.Sub(webRoot, "frontend/dist")
	handler := api.New(st, dk, webFS)

	srv := &http.Server{Addr: addr, Handler: handler}
	go func() {
		log.Printf("paldeck listening on http://localhost%s", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("http: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	log.Println("shutting down…")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
