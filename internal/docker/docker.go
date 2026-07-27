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
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	"github.com/docker/go-connections/nat"
)

// Image is the proven Palworld server image (the one you already run).
const Image = "thijsvanloef/palworld-server-docker:latest"

// Network is the shared Docker network every server Paldeck creates joins,
// alongside Paldeck's own container (see docker-compose.yml) — this is how
// Paldeck reaches each server's RCON/REST API (by container name), not via
// the host's loopback. Matches Jon's own existing convention exactly: his
// hand-run palworld/palworld-2 stacks already declare this same external
// network, and other stacks on the host (spotify/mongo) already resolve
// each other by container name over their own shared network the same way.
const Network = "palworld"

// ContainerName is the DNS-resolvable name a server's container gets on
// Network — sanitizeName (api.go) already strips anything that wouldn't be
// a valid hostname, so this is safe to use directly, no further escaping.
func ContainerName(serverName string) string { return "paldeck-" + serverName }

type Docker struct {
	cli     *client.Client
	netPrev netSample // last cumulative network reading, for HostStats' rate calc (see host.go)
	cpuPrev cpuSample // last cumulative CPU-ticks reading, for HostStats' cpu% calc (see host.go)
}

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

	netConfig := &network.NetworkingConfig{
		EndpointsConfig: map[string]*network.EndpointSettings{Network: {}},
	}
	resp, err := d.cli.ContainerCreate(ctx, cfg, host, netConfig, nil, ContainerName(o.Name))
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

var liveWorldIDRe = regexp.MustCompile(`^0/([0-9A-F]{32})/Level\.sav$`)

// activeWorldID finds dstID's own live (non-backup) world-save folder name,
// or "" if it doesn't have one yet (never started). Palworld derives this
// ID itself — from the server's own config, on boot — so it's never the
// same as another server's, and there's no way to predict it in advance;
// the only way to know it is to ask the destination directly.
func (d *Docker) activeWorldID(ctx context.Context, id string) (string, error) {
	rc, _, err := d.cli.CopyFromContainer(ctx, id, "/palworld/Pal/Saved/SaveGames/0")
	if err != nil {
		return "", err
	}
	defer rc.Close()
	tr := tar.NewReader(rc)
	var found []string
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", err
		}
		if m := liveWorldIDRe.FindStringSubmatch(hdr.Name); m != nil {
			found = append(found, m[1])
		}
	}
	switch len(found) {
	case 0:
		return "", nil
	case 1:
		return found[0], nil
	default:
		return "", fmt.Errorf("destination has multiple world folders (%s) — ambiguous", strings.Join(found, ", "))
	}
}

// ensureWorldID returns dstID's own world-save folder name, bootstrapping
// one first if dstID has never been started. A never-started container's
// volume has no world folder at all — Palworld only creates one, under an
// ID of its own choosing, once it actually boots — so ImportSave has to
// start it, wait for that default (empty) world to appear, and stop it
// again before there's anywhere valid to graft the source's data into.
func (d *Docker) ensureWorldID(ctx context.Context, id string) (string, error) {
	worldID, err := d.activeWorldID(ctx, id)
	if err != nil {
		return "", err
	}
	if worldID != "" {
		return worldID, nil
	}
	if err := d.Start(ctx, id); err != nil {
		return "", fmt.Errorf("bootstrapping default world: %w", err)
	}
	deadline := time.Now().Add(60 * time.Second)
	for {
		worldID, err = d.activeWorldID(ctx, id)
		if err != nil {
			_ = d.Stop(ctx, id)
			return "", err
		}
		if worldID != "" {
			break
		}
		if time.Now().After(deadline) {
			_ = d.Stop(ctx, id)
			return "", fmt.Errorf("timed out waiting for the server to generate its default world")
		}
		time.Sleep(2 * time.Second)
	}
	if err := d.Stop(ctx, id); err != nil {
		return "", fmt.Errorf("stopping after world bootstrap: %w", err)
	}
	return worldID, nil
}

// ImportSave copies srcID's live world (all files under SaveGames/0, minus
// its own nested backups — same exclusion ReadWorldLevelSav uses) into
// dstID's own world folder, so dstID picks it up as its world on next
// boot. Never touches srcID (read-only CopyFromContainer), so the source
// (typically an unmanaged, hand-run server Paldeck doesn't otherwise touch)
// is completely unaffected either way.
//
// Grafts under dstID's OWN world ID (from ensureWorldID), not srcID's —
// confirmed live that preserving the source's folder name silently does
// nothing, since Palworld doesn't scan SaveGames/0 for "a" world to adopt,
// it looks for the specific ID its own config derives and generates a
// fresh empty one under that ID if it's missing, ignoring whatever else
// happens to be sitting in the directory.
//
// Copies to /palworld, not .../SaveGames/0 directly: CopyToContainer
// requires its destination to already exist, and /palworld (the volume
// mount point) always does even before Pal/Saved/SaveGames/ has been
// created. CopyFromContainer's tar is rooted at the basename of the path
// requested ("0/<srcWorldID>/…") — each entry is re-rooted onto
// Pal/Saved/SaveGames/0/<dstWorldID>/…, with explicit synthetic directory
// headers for every intermediate level so extraction doesn't depend on
// Docker auto-creating missing parents.
func (d *Docker) ImportSave(ctx context.Context, srcID, dstID string) error {
	worldID, err := d.ensureWorldID(ctx, dstID)
	if err != nil {
		return fmt.Errorf("preparing destination world folder: %w", err)
	}

	rc, _, err := d.cli.CopyFromContainer(ctx, srcID, "/palworld/Pal/Saved/SaveGames/0")
	if err != nil {
		return err
	}
	defer rc.Close()

	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	now := time.Now()
	for _, dir := range []string{"Pal", "Pal/Saved", "Pal/Saved/SaveGames", "Pal/Saved/SaveGames/0", "Pal/Saved/SaveGames/0/" + worldID} {
		if err := tw.WriteHeader(&tar.Header{
			Name: dir + "/", Typeflag: tar.TypeDir, Mode: 0755, ModTime: now,
		}); err != nil {
			return err
		}
	}
	tr := tar.NewReader(rc)
	wrote := false
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		if strings.Contains(hdr.Name, "/backup/") {
			continue // historical snapshots, not part of the live world
		}
		// hdr.Name is "0/<srcWorldID>/rest…" — drop both of the first two
		// segments (the tar root and the source's own world ID) and
		// re-root the remainder under the destination's world ID instead.
		afterRoot := strings.TrimPrefix(hdr.Name, "0/")
		slash := strings.IndexByte(afterRoot, '/')
		if slash < 0 {
			continue // a bare world-ID directory entry, no file beneath it
		}
		hdr.Name = "Pal/Saved/SaveGames/0/" + worldID + "/" + afterRoot[slash+1:]
		if err := tw.WriteHeader(hdr); err != nil {
			return err
		}
		if hdr.Typeflag == tar.TypeReg {
			if _, err := io.Copy(tw, tr); err != nil {
				return err
			}
		}
		wrote = true
	}
	if err := tw.Close(); err != nil {
		return err
	}
	if !wrote {
		return fmt.Errorf("source has no world save to import")
	}
	return d.cli.CopyToContainer(ctx, dstID, "/palworld", &buf, container.CopyToContainerOptions{})
}

// ImportCandidate is an existing Palworld container Paldeck didn't create —
// a source for ImportSave.
type ImportCandidate struct {
	ContainerID string `json:"containerId"`
	Name        string `json:"name"`       // container name, minus Docker's leading "/"
	ServerName  string `json:"serverName"` // SERVER_NAME env, if present — friendlier than the container name
	Running     bool   `json:"running"`
}

// ImportCandidates lists every container running the Palworld image that
// Paldeck didn't create (no paldeck.managed label) — the pool ImportSave's
// srcID can come from. One ContainerInspect per candidate (env vars aren't
// in the ContainerList summary) — fine, this is an occasional UI action,
// not a hot path.
func (d *Docker) ImportCandidates(ctx context.Context) ([]ImportCandidate, error) {
	list, err := d.cli.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return nil, err
	}
	out := []ImportCandidate{}
	for _, c := range list {
		// c.Image can be an image ID instead of a repo:tag in some Docker
		// states, so match loosely on the repo name rather than requiring
		// an exact string match against the full pinned Image constant.
		if !strings.Contains(c.Image, "palworld-server-docker") {
			continue
		}
		if c.Labels["paldeck.managed"] == "true" {
			continue
		}
		name := strings.TrimPrefix(firstOrEmpty(c.Names), "/")
		cand := ImportCandidate{ContainerID: c.ID, Name: name, Running: c.State == "running"}
		if info, err := d.cli.ContainerInspect(ctx, c.ID); err == nil {
			for _, e := range info.Config.Env {
				if v, ok := strings.CutPrefix(e, "SERVER_NAME="); ok {
					cand.ServerName = v
					break
				}
			}
		}
		out = append(out, cand)
	}
	return out, nil
}

func firstOrEmpty(s []string) string {
	if len(s) == 0 {
		return ""
	}
	return s[0]
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
