package docker

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/docker/docker/api/types/container"
)

// HostStats is a point-in-time reading of resources across the whole Docker
// host, not any single server — backs the dashboard's overview tiles.
//
// Memory and CPU come from /proc/meminfo and /proc/stat, which reflect the
// real host even read from inside a container: unlike network and PID
// namespaces, Linux doesn't virtualize these per mount namespace, so a
// containerized Paldeck sees genuine host-wide figures with no extra bind
// mounts needed. Disk is a statfs on diskPath (the directory holding
// paldeck.db) — in production that's the bind-mounted data volume, so it
// reports the real underlying host filesystem. Network can't use the same
// trick (network namespaces ARE virtualized), so it's the sum of
// Paldeck-managed containers' own veth counters instead — real traffic,
// just scoped to Palworld servers rather than the whole host's NICs.
type HostStats struct {
	CPUPercent       float64 `json:"cpuPercent"`
	MemTotal         uint64  `json:"memTotal"`
	MemAvailable     uint64  `json:"memAvailable"`
	MemUsed          uint64  `json:"memUsed"`
	DiskTotal        uint64  `json:"diskTotal"`
	DiskFree         uint64  `json:"diskFree"`
	DiskUsed         uint64  `json:"diskUsed"`
	NetRxBytesPerSec float64 `json:"netRxBytesPerSec"`
	NetTxBytesPerSec float64 `json:"netTxBytesPerSec"`
}

// HostStats gathers the current reading. diskPath is any path on the
// filesystem to report disk usage for — pass the directory containing
// paldeck.db. Memory/disk failures are logged-and-skipped (zero fields)
// rather than failing the whole call, since network is still worth
// returning on its own.
func (d *Docker) HostStats(ctx context.Context, diskPath string) HostStats {
	var out HostStats

	if idle, total, err := readCPUTotals(); err == nil {
		out.CPUPercent = d.cpuPrev.percent(idle, total)
	}

	if total, avail, err := readMeminfo(); err == nil {
		out.MemTotal, out.MemAvailable = total, avail
		if avail < total {
			out.MemUsed = total - avail
		}
	}

	if total, free, err := diskUsage(diskPath); err == nil {
		out.DiskTotal, out.DiskFree = total, free
		if free < total {
			out.DiskUsed = total - free
		}
	}

	rx, tx := d.managedContainersNetBytes(ctx)
	out.NetRxBytesPerSec, out.NetTxBytesPerSec = d.netPrev.rate(rx, tx)

	return out
}

// readCPUTotals parses /proc/stat's aggregate "cpu" line (all cores summed,
// in USER_HZ ticks since boot) into idle and total time. A single reading
// is meaningless on its own — cpuSample.percent turns two of them, taken
// ~5s apart by the dashboard's normal poll cadence, into a percentage.
func readCPUTotals() (idle, total uint64, err error) {
	f, err := os.Open("/proc/stat")
	if err != nil {
		return 0, 0, err
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	if !sc.Scan() {
		return 0, 0, fmt.Errorf("empty /proc/stat")
	}
	fields := strings.Fields(sc.Text())
	if len(fields) < 8 || fields[0] != "cpu" {
		return 0, 0, fmt.Errorf("unexpected /proc/stat format: %q", sc.Text())
	}
	// user nice system idle iowait irq softirq [steal [guest [guest_nice]]]
	vals := make([]uint64, 0, len(fields)-1)
	for _, f := range fields[1:] {
		v, _ := strconv.ParseUint(f, 10, 64)
		vals = append(vals, v)
	}
	for _, v := range vals {
		total += v
	}
	idle = vals[3] // idle
	if len(vals) > 4 {
		idle += vals[4] // + iowait
	}
	return idle, total, nil
}

// cpuSample mirrors netSample: remembers the last cumulative /proc/stat
// reading so consecutive HostStats polls turn it into a percentage instead
// of a meaningless running tick count.
type cpuSample struct {
	mu    sync.Mutex
	idle  uint64
	total uint64
	init  bool
}

func (s *cpuSample) percent(idle, total uint64) float64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	var pct float64
	if s.init && total > s.total {
		deltaTotal := total - s.total
		// A smaller idle delta than total delta means less idle time passed
		// than wall time — the rest was busy. Guards the same counter-reset
		// case netSample does (idle "decreasing" would go negative here).
		if idle >= s.idle {
			deltaIdle := idle - s.idle
			if deltaTotal > deltaIdle {
				pct = float64(deltaTotal-deltaIdle) / float64(deltaTotal) * 100
			}
		}
	}
	s.idle, s.total, s.init = idle, total, true
	return pct
}

func readMeminfo() (total, available uint64, err error) {
	f, err := os.Open("/proc/meminfo")
	if err != nil {
		return 0, 0, err
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := sc.Text()
		switch {
		case strings.HasPrefix(line, "MemTotal:"):
			total = parseMeminfoKB(line)
		case strings.HasPrefix(line, "MemAvailable:"):
			available = parseMeminfoKB(line)
		}
	}
	if total == 0 {
		return 0, 0, fmt.Errorf("MemTotal not found in /proc/meminfo")
	}
	return total, available, nil
}

func parseMeminfoKB(line string) uint64 {
	fields := strings.Fields(line) // e.g. ["MemTotal:", "16384000", "kB"]
	if len(fields) < 2 {
		return 0
	}
	kb, _ := strconv.ParseUint(fields[1], 10, 64)
	return kb * 1024
}

func diskUsage(path string) (total, free uint64, err error) {
	var st syscall.Statfs_t
	if err := syscall.Statfs(path, &st); err != nil {
		return 0, 0, err
	}
	total = uint64(st.Blocks) * uint64(st.Bsize)
	free = uint64(st.Bavail) * uint64(st.Bsize) // unprivileged-available, matches `df`
	return total, free, nil
}

// managedContainersNetBytes sums current cumulative RX/TX byte counters
// across all running Paldeck-managed containers' virtual network
// interfaces, fetched in parallel (mirrors the metrics endpoint's
// goroutine fan-out) so N containers cost ~one round trip, not N.
func (d *Docker) managedContainersNetBytes(ctx context.Context) (rx, tx uint64) {
	ids, err := d.ManagedIDs(ctx)
	if err != nil {
		return 0, 0
	}
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, id := range ids {
		wg.Add(1)
		go func(id string) {
			defer wg.Done()
			r, err := d.cli.ContainerStats(ctx, id, false)
			if err != nil {
				return // not running (or gone) — contributes nothing, not an error
			}
			defer r.Body.Close()
			var s container.StatsResponse
			if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
				return
			}
			var crx, ttx uint64
			for _, n := range s.Networks {
				crx += n.RxBytes
				ttx += n.TxBytes
			}
			mu.Lock()
			rx += crx
			tx += ttx
			mu.Unlock()
		}(id)
	}
	wg.Wait()
	return rx, tx
}

// netSample remembers the last cumulative network reading so HostStats can
// turn Docker's running byte counters into a rate — the dashboard polls
// HostStats every 5s, so consecutive calls are exactly what's being diffed.
type netSample struct {
	mu   sync.Mutex
	at   time.Time
	rx   uint64
	tx   uint64
	init bool
}

func (s *netSample) rate(rx, tx uint64) (rxPerSec, txPerSec float64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	if s.init {
		if dt := now.Sub(s.at).Seconds(); dt > 0 {
			// A smaller reading than last time means a container's counter
			// reset (e.g. it restarted) — report 0 for this tick rather than
			// a bogus negative/wrapped rate.
			if rx >= s.rx {
				rxPerSec = float64(rx-s.rx) / dt
			}
			if tx >= s.tx {
				txPerSec = float64(tx-s.tx) / dt
			}
		}
	}
	s.at, s.rx, s.tx, s.init = now, rx, tx, true
	return
}
