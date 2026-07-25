import type { HostStats } from '../types'

const clampPct = (v: number) => Math.max(0, Math.min(100, v))

function formatBytes(b: number) {
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(0)} MB`
  return `${(b / 1024 ** 3).toFixed(1)} GB`
}

function formatRate(bytesPerSec: number) {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`
  if (bytesPerSec < 1024 ** 2) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / 1024 ** 2).toFixed(1)} MB/s`
}

const IcHost = () => (
  <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="6" rx="1.5" /><rect x="3" y="14" width="18" height="6" rx="1.5" /><path d="M7 7h.01M7 17h.01" /></svg>
)

// Resources across the whole Docker host, not any one server. Memory/disk
// are real host-wide figures (see internal/docker/host.go for how a
// containerized panel gets those without extra mounts); network is the sum
// of Paldeck-managed containers' own traffic, since the host's real NICs
// aren't visible the same way.
export function HostCard({ stats }: { stats?: HostStats }) {
  const memPct = stats?.memTotal ? clampPct((stats.memUsed / stats.memTotal) * 100) : null
  const diskPct = stats?.diskTotal ? clampPct((stats.diskUsed / stats.diskTotal) * 100) : null

  const bar = (label: string, pct: number | null, display: string) => (
    <div>
      <div className="metric-lbl">
        <span>{label}</span>
        <span>{display}</span>
      </div>
      <div className="mbar-track">
        <i style={{ width: `${pct ?? 0}%` }} />
      </div>
    </div>
  )

  return (
    <div className="formcard" style={{ marginBottom: 20 }}>
      <div className="formcard-head">
        <span className="formcard-ic"><IcHost /></span>
        <b>Host resources</b>
      </div>
      <div className="metrics-row">
        {bar('Memory', memPct, stats ? `${formatBytes(stats.memUsed)} / ${formatBytes(stats.memTotal)}` : '—')}
        {bar('Disk', diskPct, stats ? `${formatBytes(stats.diskUsed)} / ${formatBytes(stats.diskTotal)}` : '—')}
        <div>
          <div className="metric-lbl">
            <span>Network</span>
            <span>{stats ? `↓ ${formatRate(stats.netRxBytesPerSec)}` : '—'}</span>
          </div>
          <div className="metric-lbl" style={{ marginTop: 5 }}>
            <span />
            <span>{stats ? `↑ ${formatRate(stats.netTxBytesPerSec)}` : ''}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
