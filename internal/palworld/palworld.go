// Package palworld is a minimal client for the official Palworld dedicated
// server REST API. We reach it by the server's container name over the
// shared "palworld" Docker network (see docker.Network/docker.ContainerName)
// — not via the host's loopback, since Paldeck itself runs containerized
// and its own loopback isn't the host's. REST_API_PORT is always 8212
// *inside* the container regardless of which host port it's published to
// (docker.go hardcodes it — only the host-side mapping varies per server).
// Auth is HTTP Basic, user "admin", password = the server's ADMIN_PASSWORD.
// Every call carries a short timeout — the panel must degrade to "—" when a
// server is down, never hang.
package palworld

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type Client struct {
	base string
	pass string
	hc   *http.Client
}

// New dials the server's REST API by its container name (e.g.
// docker.ContainerName(serverName)) — container-to-container over the
// shared network, resolved by Docker's embedded DNS.
func New(containerName string, adminPass string) *Client {
	return &Client{
		base: fmt.Sprintf("http://%s:8212", containerName),
		pass: adminPass,
		hc:   &http.Client{Timeout: 3 * time.Second},
	}
}

// Info is GET /v1/api/info.
type Info struct {
	Version     string `json:"version"`
	ServerName  string `json:"servername"`
	Description string `json:"description"`
}

// Metrics is GET /v1/api/metrics.
type Metrics struct {
	ServerFPS        int     `json:"serverfps"`
	CurrentPlayerNum int     `json:"currentplayernum"`
	ServerFrameTime  float64 `json:"serverframetime"`
	MaxPlayerNum     int     `json:"maxplayernum"`
	UptimeSec        int     `json:"uptime"`
	Days             int     `json:"days"`
}

// Player is one entry of GET /v1/api/players.
type Player struct {
	Name      string  `json:"name"`
	PlayerID  string  `json:"playerId"`
	UserID    string  `json:"userId"`
	IP        string  `json:"ip"`
	Ping      float64 `json:"ping"`
	LocationX float64 `json:"location_x"`
	LocationY float64 `json:"location_y"`
	Level     int     `json:"level"`
}

func (c *Client) Info(ctx context.Context) (Info, error) {
	var v Info
	return v, c.get(ctx, "/v1/api/info", &v)
}

func (c *Client) Metrics(ctx context.Context) (Metrics, error) {
	var v Metrics
	return v, c.get(ctx, "/v1/api/metrics", &v)
}

func (c *Client) Players(ctx context.Context) ([]Player, error) {
	var wrap struct {
		Players []Player `json:"players"`
	}
	err := c.get(ctx, "/v1/api/players", &wrap)
	return wrap.Players, err
}

// Announce broadcasts a message to everyone on the server.
func (c *Client) Announce(ctx context.Context, message string) error {
	return c.post(ctx, "/v1/api/announce", map[string]string{"message": message})
}

func (c *Client) Kick(ctx context.Context, userID, message string) error {
	return c.post(ctx, "/v1/api/kick", map[string]string{"userid": userID, "message": message})
}

func (c *Client) Ban(ctx context.Context, userID, message string) error {
	return c.post(ctx, "/v1/api/ban", map[string]string{"userid": userID, "message": message})
}

// Save asks the server to write the world to disk — used before graceful stop.
func (c *Client) Save(ctx context.Context) error {
	return c.post(ctx, "/v1/api/save", nil)
}

func (c *Client) get(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+path, nil)
	if err != nil {
		return err
	}
	req.SetBasicAuth("admin", c.pass)
	res, err := c.hc.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("palworld %s: %s", path, res.Status)
	}
	return json.NewDecoder(res.Body).Decode(out)
}

func (c *Client) post(ctx context.Context, path string, body any) error {
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.base+path, rd)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.SetBasicAuth("admin", c.pass)
	res, err := c.hc.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	_, _ = io.Copy(io.Discard, res.Body) // some endpoints answer plain "OK"
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return fmt.Errorf("palworld %s: %s", path, res.Status)
	}
	return nil
}
