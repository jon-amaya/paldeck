// Package docker wraps the first-party Docker SDK for the one thing Paldeck
// needs: run a Palworld server per container, and stream its logs. Containers
// are created with a TTY so logs come back as a single raw stream (no stdcopy
// demuxing) — perfect for piping straight to a browser console.
package docker

import (
	"context"
	"fmt"
	"io"

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
	RconPort  int
	AdminPass string
	Volume    string // named volume for /palworld

	// Palworld settings (env-var names verified against the image docs).
	Description    string
	MaxPlayers     int
	ServerPassword string
	Difficulty     string // None | Normal | Difficult
	PvP            bool
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

	bind := func(hostPort int) []nat.PortBinding {
		return []nat.PortBinding{{HostIP: "0.0.0.0", HostPort: fmt.Sprintf("%d", hostPort)}}
	}

	cfg := &container.Config{
		Image: Image,
		Tty:   true, // raw combined log stream
		Labels: map[string]string{
			"paldeck.managed": "true",
			"paldeck.name":    o.Name,
		},
		ExposedPorts: nat.PortSet{gameP: {}, queryP: {}, rconP: {}},
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
			"ADMIN_PASSWORD=" + o.AdminPass,
			"UPDATE_ON_BOOT=true",
		},
	}
	host := &container.HostConfig{
		RestartPolicy: container.RestartPolicy{Name: container.RestartPolicyUnlessStopped},
		PortBindings: nat.PortMap{
			gameP:  bind(o.GamePort),
			queryP: bind(o.QueryPort),
			rconP:  bind(o.RconPort),
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
