import type { Server, LifecycleAction, PendingAction, ServerMetrics } from '../types'
import { PENDING_LABEL } from '../types'

const clampPct = (v: number) => Math.max(0, Math.min(100, v))
const gb = (b: number) => (b / 1024 ** 3).toFixed(1)

// One server on the list: an identity block (avatar + name + subtitle, not
// bare text), a live status pill, thin CPU/Memory/Players bars when running
// metrics are available, ports, and quick actions. Manage → the tabbed detail.
export function ServerCard({
  s,
  pending,
  metrics,
  onAction,
  onOpen,
}: {
  s: Server
  pending?: PendingAction
  metrics?: ServerMetrics // present only for running servers with a recent poll
  onAction: (id: string, a: LifecycleAction) => void
  onOpen: (id: string) => void
}) {
  const running = s.status === 'running'
  const busy = pending !== undefined
  const initial = s.name.trim().charAt(0).toUpperCase() || '?'
  const created = new Date(s.createdAt)

  const cpuPct = metrics?.cpuPercent != null ? clampPct(metrics.cpuPercent) : null
  const memPct =
    metrics?.memUsed != null && metrics.memLimit ? clampPct((metrics.memUsed / metrics.memLimit) * 100) : null
  const playerCount = metrics?.players ?? null
  const maxPlayers = metrics?.maxPlayers ?? s.maxPlayers
  const playerPct = playerCount != null ? clampPct((playerCount / Math.max(1, maxPlayers)) * 100) : null

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
    <div className="scard">
      <div className="scard-top">
        <div className="scard-id">
          <span className="avatar">{initial}</span>
          <div className="scard-name">
            <b>{s.name}</b>
            <span className="scard-sub">
              Palworld dedicated · created {created.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
          </div>
          <span className={`st ${pending ? 'pend' : running ? 'run' : ''}`}>
            <i />
            {pending ? PENDING_LABEL[pending] : s.status}
          </span>
        </div>
        <div className="scard-acts">
          {running ? (
            <button onClick={() => onAction(s.id, 'stop')} disabled={busy}>
              {pending === 'stop' ? <span className="spin" aria-hidden="true" /> : '■'} Stop
            </button>
          ) : (
            <button onClick={() => onAction(s.id, 'start')} disabled={busy}>
              {pending === 'start' ? <span className="spin" aria-hidden="true" /> : '▶'} Start
            </button>
          )}
          <button className="solid" onClick={() => onOpen(s.id)}>
            Manage →
          </button>
        </div>
      </div>

      <div className="metrics-row">
        {bar('CPU', cpuPct, cpuPct != null ? `${cpuPct.toFixed(0)}%` : '—')}
        {bar('Memory', memPct, metrics?.memUsed != null ? `${gb(metrics.memUsed)} GB` : '—')}
        {bar(
          'Players',
          playerPct,
          playerCount != null ? `${playerCount} / ${maxPlayers}${s.pvp ? ' · PvP' : ''}` : '—',
        )}
      </div>

      <div className="scard-foot">
        <div className="scard-ports">
          <span className="port-pill">:{s.gamePort}/udp</span>
          <span className="port-pill">query :{s.queryPort}</span>
          <span className="port-pill">rcon :{s.rconPort}</span>
          <span className="port-pill">rest :{s.restPort}</span>
        </div>
        {metrics?.version && <span className="mono mut" style={{ fontSize: 11 }}>{metrics.version}</span>}
      </div>
    </div>
  )
}
