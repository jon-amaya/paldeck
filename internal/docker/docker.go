// Package docker wraps the first-party Docker SDK for the one thing Paldeck
// needs: run a Palworld server per container, and stream its logs. Containers
// are created with a TTY so logs come back as a single raw stream (no stdcopy
// demuxing) — perfect for piping straight to a browser console.
package docker

import (
	"archive/tar"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/client"
	"github.com/docker/go-connections/nat"
)

// Image is the proven Palworld server image (the one you already run).
const Image = "thijsvanloef/palworld-server-docker:latest"

type Docker struct{ cli *client.Client }

func New() (*Docker, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, err
	}
	return &Docker{cli: cli}, nil
}

func (d *Docker) Close() error { return d.cli.Close() }

type CreateOpts struct {
	Name      string
	GamePort  int
	QueryPort int
	RconPort  int // bound to 127.0.0.1 — full admin command execution, panel-only
	RestPort  int // host port for the Palworld REST API, bound to 127.0.0.1
	AdminPass string
	Volume    string // named volume for /palworld

	// Palworld settings (env-var names verified against the image docs).
	Description    string
	MaxPlayers     int
	ServerPassword string
	Difficulty     string // None | Normal | Difficult
	PvP            bool
	// Extra world-settings env vars (EXP_RATE=3, DEATH_PENALTY=None, …) —
	// keys are validated upstream against the API's allowlist.
	Extra map[string]string
}

// EnsureImage pulls the Palworld image if it isn't present yet. The pull is a
// few hundred MB the first time; after that it's a no-op.
func (d *Docker) EnsureImage(ctx context.Context) error {
	_, _, err := d.cli.ImageInspectWithRaw(ctx, Image)
	if err == nil {
		return nil // already have it
	}
	r, err := d.cli.ImagePull(ctx, Image, image.PullOptions{})
	if err != nil {
		return err
	}
	defer r.Close()
	_, err = io.Copy(io.Discard, r) // block until the pull finishes
	return err
}

func (d *Docker) Create(ctx context.Context, o CreateOpts) (string, error) {
	gameP := nat.Port(fmt.Sprintf("%d/udp", o.GamePort))
	queryP := nat.Port(fmt.Sprintf("%d/udp", o.QueryPort))
	rconP := nat.Port(fmt.Sprintf("%d/tcp", o.RconPort))
	restP := nat.Port("8212/tcp") // REST always runs on 8212 inside the container

	bind := func(hostPort int) []nat.PortBinding {
		return []nat.PortBinding{{HostIP: "0.0.0.0", HostPort: fmt.Sprintf("%d", hostPort)}}
	}
	// The admin REST/RCON channels only ever answer to this machine — the panel proxies.
	loopback := func(hostPort int) []nat.PortBinding {
		return []nat.PortBinding{{HostIP: "127.0.0.1", HostPort: fmt.Sprintf("%d", hostPort)}}
	}

	cfg := &container.Config{
		Image: Image,
		Tty:   true, // raw combined log stream
		Labels: map[string]string{
			"paldeck.managed": "true",
			"paldeck.name":    o.Name,
		},
		ExposedPorts: nat.PortSet{gameP: {}, queryP: {}, rconP: {}, restP: {}},
		Env: []string{
			"PUID=1000", "PGID=1000",
			"SERVER_NAME=" + o.Name,
			"SERVER_DESCRIPTION=" + o.Description,
			fmt.Sprintf("PLAYERS=%d", o.MaxPlayers),
			"SERVER_PASSWORD=" + o.ServerPassword,
			"DIFFICULTY=" + o.Difficulty,
			fmt.Sprintf("IS_PVP=%t", o.PvP),
			fmt.Sprintf("PORT=%d", o.GamePort),
			fmt.Sprintf("QUERY_PORT=%d", o.QueryPort),
			"RCON_ENABLED=true",
			fmt.Sprintf("RCON_PORT=%d", o.RconPort),
			"REST_API_ENABLED=true",
			"REST_API_PORT=8212",
			"ADMIN_PASSWORD=" + o.AdminPass,
			"UPDATE_ON_BOOT=true",
			"BACKUP_ENABLED=true",
			"CROSSPLAY_PLATFORMS=(Steam,Xbox,PS5,Mac)",
		},
	}
	for k, v := range o.Extra {
		cfg.Env = append(cfg.Env, k+"="+v)
	}
	// PUBLIC_PORT isn't independently user-settable (see allowedEnv) — when
	// PUBLIC_IP is set, derive it from this server's own game port so the
	// two can't drift out of sync the way manually-paired env vars can.
	if o.Extra["PUBLIC_IP"] != "" {
		cfg.Env = append(cfg.Env, fmt.Sprintf("PUBLIC_PORT=%d", o.GamePort))
	}
	host := &container.HostConfig{
		RestartPolicy: container.RestartPolicy{Name: container.RestartPolicyUnlessStopped},
		PortBindings: nat.PortMap{
			gameP:  bind(o.GamePort),
			queryP: bind(o.QueryPort),
			rconP:  loopback(o.RconPort),
			restP:  loopback(o.RestPort),
		},
		Mounts: []mount.Mount{{
			Type:   mount.TypeVolume,
			Source: o.Volume,
			Target: "/palworld",
		}},
	}

	resp, err := d.cli.ContainerCreate(ctx, cfg, host, nil, nil, "paldeck-"+o.Name)
	if err != nil {
		return "", err
	}
	return resp.ID, nil
}

func (d *Docker) Start(ctx context.Context, id string) error {
	return d.cli.ContainerStart(ctx, id, container.StartOptions{})
}

// Stop asks the container to stop. The image saves the world on SIGTERM but
// needs a while; 30s produced SIGKILLs (exit 137) in testing, so give it 90s.
// The real fix — RCON save + shutdown before stopping — lands with spec 003.
func (d *Docker) Stop(ctx context.Context, id string) error {
	t := 90
	return d.cli.ContainerStop(ctx, id, container.StopOptions{Timeout: &t})
}

func (d *Docker) Restart(ctx context.Context, id string) error {
	t := 90
	return d.cli.ContainerRestart(ctx, id, container.StopOptions{Timeout: &t})
}

func (d *Docker) Remove(ctx context.Context, id string) error {
	return d.cli.ContainerRemove(ctx, id, container.RemoveOptions{Force: true, RemoveVolumes: false})
}

// Status returns "running", "exited", "created", "absent", … for a container id.
func (d *Docker) Status(ctx context.Context, id string) string {
	if id == "" {
		return "created"
	}
	info, err := d.cli.ContainerInspect(ctx, id)
	if err != nil {
		return "absent"
	}
	return info.State.Status
}

// Logs returns a following log stream for the container. Because containers use
// a TTY, this is a plain combined stream — read it line by line.
func (d *Docker) Logs(ctx context.Context, id string) (io.ReadCloser, error) {
	return d.cli.ContainerLogs(ctx, id, container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Follow:     true,
		Tail:       "200",
		Timestamps: true, // daemon-side RFC3339Nano prefix — real emit times
	})
}

// StatsSnapshot is one point-in-time resource reading for a container.
type StatsSnapshot struct {
	CPUPercent float64
	MemUsed    uint64
	MemLimit   uint64
}

// Stats reads one resource sample. stream=false makes the daemon take two
// internal samples ~1s apart, so PreCPUStats is populated and we can compute
// CPU% = Δcontainer-cpu / Δsystem-cpu × online-cpus × 100 (docker CLI formula).
func (d *Docker) Stats(ctx context.Context, id string) (StatsSnapshot, error) {
	var out StatsSnapshot
	r, err := d.cli.ContainerStats(ctx, id, false)
	if err != nil {
		return out, err
	}
	defer r.Body.Close()
	var s container.StatsResponse
	if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
		return out, err
	}

	cpuDelta := float64(s.CPUStats.CPUUsage.TotalUsage) - float64(s.PreCPUStats.CPUUsage.TotalUsage)
	sysDelta := float64(s.CPUStats.SystemUsage) - float64(s.PreCPUStats.SystemUsage)
	online := float64(s.CPUStats.OnlineCPUs)
	if online == 0 {
		online = float64(len(s.CPUStats.CPUUsage.PercpuUsage))
	}
	if sysDelta > 0 && cpuDelta > 0 {
		out.CPUPercent = cpuDelta / sysDelta * online * 100
	}

	out.MemUsed = s.MemoryStats.Usage
	// Like the docker CLI: don't count reclaimable page cache as "used".
	if cache, ok := s.MemoryStats.Stats["inactive_file"]; ok && cache < out.MemUsed {
		out.MemUsed -= cache
	}
	out.MemLimit = s.MemoryStats.Limit
	return out, nil
}

// StartedAt returns when the container last started (zero time if unknown).
func (d *Docker) StartedAt(ctx context.Context, id string) (time.Time, error) {
	info, err := d.cli.ContainerInspect(ctx, id)
	if err != nil {
		return time.Time{}, err
	}
	return time.Parse(time.RFC3339Nano, info.State.StartedAt)
}

// ReadWorldLevelSav streams the container's save tree and returns the live
// world's Level.sav bytes (skipping the image's nested backups). Works on
// stopped containers too — CopyFromContainer reads the volume directly.
func (d *Docker) ReadWorldLevelSav(ctx context.Context, id string) ([]byte, error) {
	rc, _, err := d.cli.CopyFromContainer(ctx, id, "/palworld/Pal/Saved/SaveGames/0")
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	tr := tar.NewReader(rc)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			return nil, fmt.Errorf("no Level.sav found in save tree")
		}
		if err != nil {
			return nil, err
		}
		name := hdr.Name
		if !strings.HasSuffix(name, "/Level.sav") || strings.Contains(name, "/backup/") {
			continue
		}
		b, err := io.ReadAll(tr)
		if err != nil {
			return nil, err
		}
		return b, nil
	}
}

// Backup is one hourly world snapshot the image's own cron job writes to
// .../<worldId>/backup/world/<timestamp>/. The timestamp folder name IS the
// backup's identity — no separate metadata file exists.
type Backup struct {
	WorldID   string    `json:"worldId"`
	Timestamp string    `json:"timestamp"` // e.g. "2026.07.20-09.35.28"
	SizeBytes int64     `json:"sizeBytes"` // Level.sav size, as a proxy for the snapshot
	ModTime   time.Time `json:"modTime"`
}

var backupPathRe = regexp.MustCompile(`/([0-9A-F]{32})/backup/world/([0-9.\-]+)/Level\.sav$`)

// ListBackups walks the save tree tar (same technique as ReadWorldLevelSav)
// and collects one entry per backup timestamp folder — no exec needed.
func (d *Docker) ListBackups(ctx context.Context, id string) ([]Backup, error) {
	rc, _, err := d.cli.CopyFromContainer(ctx, id, "/palworld/Pal/Saved/SaveGames/0")
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	tr := tar.NewReader(rc)
	out := []Backup{} // not var out []Backup — nil slice marshals to JSON null
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		if m := backupPathRe.FindStringSubmatch(hdr.Name); m != nil {
			out = append(out, Backup{WorldID: m[1], Timestamp: m[2], SizeBytes: hdr.Size, ModTime: hdr.ModTime})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Timestamp > out[j].Timestamp })
	return out, nil
}

// RestoreBackup overwrites the live world's Level.sav/LevelMeta.sav/Players
// with one backup snapshot's files. Copies out the snapshot directory (tar
// rooted at the timestamp folder), re-roots each entry under the live world
// path, and copies it back in — no exec, same Copy APIs as everywhere else.
func (d *Docker) RestoreBackup(ctx context.Context, id, worldID, timestamp string) error {
	if !isSafeSegment(worldID) || !isSafeSegment(timestamp) {
		return fmt.Errorf("invalid backup reference")
	}
	src := fmt.Sprintf("/palworld/Pal/Saved/SaveGames/0/%s/backup/world/%s", worldID, timestamp)
	rc, _, err := d.cli.CopyFromContainer(ctx, id, src)
	if err != nil {
		return err
	}
	defer rc.Close()

	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	tr := tar.NewReader(rc)
	prefix := timestamp + "/"
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		if !strings.HasPrefix(hdr.Name, prefix) {
			continue // shouldn't happen; guard anyway
		}
		hdr.Name = strings.TrimPrefix(hdr.Name, prefix)
		if hdr.Name == "" {
			continue // the root dir entry itself
		}
		if err := tw.WriteHeader(hdr); err != nil {
			return err
		}
		if hdr.Typeflag == tar.TypeReg {
			if _, err := io.Copy(tw, tr); err != nil {
				return err
			}
		}
	}
	if err := tw.Close(); err != nil {
		return err
	}

	dst := fmt.Sprintf("/palworld/Pal/Saved/SaveGames/0/%s/", worldID)
	return d.cli.CopyToContainer(ctx, id, dst, &buf, container.CopyToContainerOptions{})
}

// isSafeSegment guards against path traversal in values that came from a URL
// path segment before we splice them into a container path.
func isSafeSegment(s string) bool {
	if s == "" || strings.ContainsAny(s, "/\\") || strings.Contains(s, "..") {
		return false
	}
	return true
}

// ManagedIDs lists container ids Paldeck created (label filter) — handy for
// reconciliation later.
func (d *Docker) ManagedIDs(ctx context.Context) ([]string, error) {
	f := filters.NewArgs(filters.Arg("label", "paldeck.managed=true"))
	list, err := d.cli.ContainerList(ctx, container.ListOptions{All: true, Filters: f})
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(list))
	for _, c := range list {
		ids = append(ids, c.ID)
	}
	return ids, nil
}

// UsedHostPorts returns every host port currently published by ANY
// container on this Docker host — not just Paldeck-managed ones — split by
// protocol (tcp/udp share independent kernel port namespaces, so a number
// used by one never blocks the other; see the "different protocol+bind"
// comment on the REST port below). Without this, Paldeck's pool (game
// 8211+, query 27015+offset, rcon 25575+offset, rest 8212+offset) only
// avoids collisions with servers Paldeck itself created — a pre-existing,
// unmanaged deployment on the same host (e.g. a manually-run container
// using those same defaults) would otherwise get silently reused.
func (d *Docker) UsedHostPorts(ctx context.Context) (udp, tcp map[int]bool, err error) {
	list, err := d.cli.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return nil, nil, err
	}
	udp, tcp = map[int]bool{}, map[int]bool{}
	for _, c := range list {
		for _, p := range c.Ports {
			if p.PublicPort == 0 {
				continue
			}
			if p.Type == "udp" {
				udp[int(p.PublicPort)] = true
			} else {
				tcp[int(p.PublicPort)] = true
			}
		}
	}
	return udp, tcp, nil
}
