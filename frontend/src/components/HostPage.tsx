import { useEffect, useState } from 'react'
import type { HostStats } from '../types'
import { Sparkline } from './Sparkline'

function formatBytes(b: number) {
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(0)} MB`
  return `${(b / 1024 ** 3).toFixed(1)} GB`
}

function formatRate(bytesPerSec: number) {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`
  if (bytesPerSec < 1024 ** 2) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / 1024 ** 2).toFixed(1)} MB/s`
}

// ~5min at the 5s poll interval — enough to see a trend, matching
// ServerDetail's per-server history tiles.
const HISTORY_LEN = 60

// Dedicated sidebar page: resources across the whole Docker host, not any
// one server. CPU/memory/disk are real host-wide figures (see
// internal/docker/host.go for how a containerized panel gets those without
// extra mounts); network is the sum of Paldeck-managed containers' own
// traffic, since the host's real NICs aren't visible the same way.
export function HostPage({ stats }: { stats?: HostStats }) {
  const [cpuHist, setCpuHist] = useState<number[]>([])
  const [memHist, setMemHist] = useState<number[]>([])
  const [diskHist, setDiskHist] = useState<number[]>([])
  const [netHist, setNetHist] = useState<number[]>([])

  useEffect(() => {
    if (!stats) return
    const push = (setter: typeof setCpuHist, v: number) => setter((h) => [...h, v].slice(-HISTORY_LEN))
    push(setCpuHist, stats.cpuPercent)
    push(setMemHist, stats.memUsed)
    push(setDiskHist, stats.diskUsed)
    push(setNetHist, stats.netRxBytesPerSec + stats.netTxBytesPerSec)
  }, [stats])

  const gb = (b: number) => (b / 1024 ** 3).toFixed(1)

  return (
    <>
      <div className="mhead">
        <h1>Host</h1>
      </div>
      <p className="note" style={{ marginBottom: 18 }}>
        Resources across the whole Docker host, not any one server. Network is the combined traffic of
        Paldeck-managed servers only — a containerized panel can't see the host's real network interfaces
        directly, unlike CPU/memory/disk which are genuine host-wide figures.
      </p>
      <div className="tiles">
        <div className={`tile tile-graph ${!stats ? 'soon' : ''}`}>
          <small>CPU</small>
          <b>{stats ? `${stats.cpuPercent.toFixed(1)}%` : '—'}</b>
          {cpuHist.length > 1 && <Sparkline data={cpuHist} formatValue={(v) => `${v.toFixed(1)}%`} />}
        </div>
        <div className={`tile tile-graph ${!stats ? 'soon' : ''}`}>
          <small>Memory</small>
          <b>{stats ? `${formatBytes(stats.memUsed)} / ${formatBytes(stats.memTotal)}` : '—'}</b>
          {memHist.length > 1 && <Sparkline data={memHist} color="var(--warn)" formatValue={(v) => `${gb(v)} GB`} />}
        </div>
        <div className={`tile tile-graph ${!stats ? 'soon' : ''}`}>
          <small>Disk</small>
          <b>{stats ? `${formatBytes(stats.diskUsed)} / ${formatBytes(stats.diskTotal)}` : '—'}</b>
          {diskHist.length > 1 && <Sparkline data={diskHist} color="var(--run)" formatValue={(v) => `${gb(v)} GB`} />}
        </div>
        <div className={`tile tile-graph ${!stats ? 'soon' : ''}`}>
          <small>Network (managed servers)</small>
          <b>{stats ? `↓ ${formatRate(stats.netRxBytesPerSec)}  ↑ ${formatRate(stats.netTxBytesPerSec)}` : '—'}</b>
          {netHist.length > 1 && (
            <Sparkline data={netHist} color="var(--acc-strong)" formatValue={(v) => formatRate(v)} />
          )}
        </div>
      </div>
    </>
  )
}
