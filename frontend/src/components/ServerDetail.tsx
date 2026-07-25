import { useEffect, useState } from 'react'
import type { Server, LifecycleAction, PendingAction, ServerMetrics } from '../types'
import { PENDING_LABEL } from '../types'
import { api } from '../api'
import { LogConsole } from './LogConsole'
import { RconPanel } from './RconPanel'
import { PlayersPanel } from './PlayersPanel'
import { PalsPanel } from './PalsPanel'
import { MapView } from './MapView'
import { WorldSettingsPanel } from './WorldSettingsPanel'
import { BackupsPanel } from './BackupsPanel'
import { BroadcastModal } from './BroadcastModal'
import { Sparkline } from './Sparkline'

const TABS = ['Overview', 'Console', 'Players', 'Pals', 'Map', 'Backups', 'Settings'] as const
export type DetailTab = (typeof TABS)[number]
type Tab = DetailTab

function fmtUptime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m ${sec % 60}s`
}
const gb = (b: number) => (b / 1024 ** 3).toFixed(1)

// How many samples of history to keep for the Overview sparklines. At the 5s
// poll interval this is ~5 minutes — enough to see a trend, not so much the
// tile grows unbounded.
const HISTORY_LEN = 60

// The operator view for one server: header (status + actions + broadcast) and
// tabs. Metrics poll every 5s while the view is open; missing values render
// as "—" (stopped server, or created before the REST plumbing). The console
// stays mounted across tab switches so it never loses its lines.
export function ServerDetail({
  s,
  pending,
  initialTab,
  onBack,
  onAction,
  onDelete,
}: {
  s: Server
  pending?: PendingAction
  initialTab?: DetailTab
  onBack: () => void
  onAction: (id: string, a: LifecycleAction) => void
  onDelete: (s: Server) => void
}) {
  const [tab, setTab] = useState<Tab>(initialTab ?? 'Overview')

  // sidebar deep-links (Pals/Map) can retarget the open tab
  useEffect(() => {
    if (initialTab) setTab(initialTab)
  }, [initialTab, s.id])
  const [m, setM] = useState<ServerMetrics | null>(null)
  const [cpuHist, setCpuHist] = useState<number[]>([])
  const [memHist, setMemHist] = useState<number[]>([])
  const [playerHist, setPlayerHist] = useState<number[]>([])
  const [showBroadcast, setShowBroadcast] = useState(false)
  const running = s.status === 'running'
  const busy = pending !== undefined

  useEffect(() => {
    let live = true
    // fresh trend lines when switching servers — a new server's history
    // shouldn't carry over the previous one's numbers
    setCpuHist([])
    setMemHist([])
    setPlayerHist([])
    const push = (setter: typeof setCpuHist, v: number) =>
      setter((h) => [...h, v].slice(-HISTORY_LEN))
    const load = async () => {
      try {
        const r = await api.metrics(s.id)
        if (!live) return
        setM(r)
        if (r.cpuPercent != null) push(setCpuHist, r.cpuPercent)
        if (r.memUsed != null) push(setMemHist, r.memUsed)
        if (r.players != null) push(setPlayerHist, r.players)
      } catch {
        /* metrics are best-effort; tiles stay at "—" */
      }
    }
    load()
    const t = setInterval(load, 5000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [s.id])

  const actionBtn = (a: LifecycleAction, icon: string, label: string, unavailable: boolean) => (
    <button onClick={() => onAction(s.id, a)} disabled={busy || unavailable}>
      {pending === a ? <span className="spin" aria-hidden="true" /> : icon} {label}
    </button>
  )

  return (
    <>
      <div className="dhead">
        <button className="icon-btn" onClick={onBack} aria-label="Back to servers" title="Back to servers">
          ←
        </button>
        <span className="avatar" style={{ width: 34, height: 34, fontSize: 14, borderRadius: 11 }}>
          {s.name.trim().charAt(0).toUpperCase() || '?'}
        </span>
        <div className="scard-name">
          <h1>{s.name}</h1>
          <span className="scard-sub">
            Palworld dedicated · created{' '}
            {new Date(s.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        </div>
        <span className={`st ${pending ? 'pend' : running ? 'run' : ''}`}>
          <i />
          {pending ? PENDING_LABEL[pending] : s.status}
        </span>
        <span className="spacer" />
        <div className="acts">
          {actionBtn('start', '▶', 'Start', running)}
          {actionBtn('stop', '■', 'Stop', !running)}
          {actionBtn('restart', '↻', 'Restart', false)}
          <button
            onClick={() => setShowBroadcast(true)}
            disabled={!running || !m?.restAvailable}
            title={!m?.restAvailable ? 'Needs the REST API (recreate pre-003 servers)' : 'Message all players'}
          >
            📣 Broadcast
          </button>
        </div>
      </div>

      <nav className="tabs" aria-label="Server sections">
        {TABS.map((t) => (
          <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>

      <section className={`tabpanel ${tab === 'Overview' ? '' : 'hidden'}`}>
        {s.description && <p className="desc">{s.description}</p>}
        <div className="tiles">
          <div className={`tile tile-graph ${m?.players == null ? 'soon' : ''}`}>
            <small>Players</small>
            <b>{m?.players ?? '—'} / {m?.maxPlayers ?? s.maxPlayers}</b>
            {playerHist.length > 1 && (
              <Sparkline data={playerHist} color="var(--run)" formatValue={(v) => `${Math.round(v)} online`} />
            )}
          </div>
          <div className={`tile ${m?.uptimeSec == null ? 'soon' : ''}`}>
            <small>Uptime</small>
            <b>{m?.uptimeSec != null ? fmtUptime(m.uptimeSec) : '—'}</b>
          </div>
          <div className={`tile tile-graph ${m?.cpuPercent == null ? 'soon' : ''}`}>
            <small>CPU</small>
            <b>{m?.cpuPercent != null ? `${m.cpuPercent.toFixed(1)}%` : '—'}</b>
            {cpuHist.length > 1 && (
              <Sparkline data={cpuHist} formatValue={(v) => `${v.toFixed(1)}%`} />
            )}
          </div>
          <div className={`tile tile-graph ${m?.memUsed == null ? 'soon' : ''}`}>
            <small>Memory</small>
            <b>{m?.memUsed != null ? `${gb(m.memUsed)} / ${gb(m.memLimit ?? 0)} GB` : '—'}</b>
            {memHist.length > 1 && (
              <Sparkline data={memHist} color="var(--warn)" formatValue={(v) => `${gb(v)} GB`} />
            )}
          </div>
          <div className={`tile ${m?.version == null ? 'soon' : ''}`}>
            <small>Version</small>
            <b className="mono">{m?.version ?? '—'}</b>
          </div>
          <div className={`tile ${m?.day == null ? 'soon' : ''}`}>
            <small>In-game day</small>
            <b>{m?.day != null ? `Day ${m.day}` : '—'}</b>
          </div>
          <div className={`tile ${m?.fps == null ? 'soon' : ''}`}>
            <small>Server FPS</small>
            <b>{m?.fps ?? '—'}</b>
          </div>
          <div className="tile"><small>Game port</small><b className="mono">:{s.gamePort}</b></div>
          <div className="tile"><small>Query / RCON</small><b className="mono">:{s.queryPort} · :{s.rconPort}</b></div>
          <div className="tile"><small>REST API</small><b className="mono">:{s.restPort}</b></div>
          <div className="tile"><small>Created</small><b>{new Date(s.createdAt).toLocaleDateString()}</b></div>
        </div>
        {m && !m.restAvailable && (
          <p className="tiles-note">
            This server was created before the REST API plumbing — players,
            version, day and broadcast need a recreate. CPU/memory/uptime work
            regardless.
          </p>
        )}
        {!running && (
          <p className="tiles-note">Live metrics appear while the server is running.</p>
        )}
      </section>

      <section className={`tabpanel ${tab === 'Console' ? '' : 'hidden'}`}>
        <LogConsole id={s.id} name={s.name} />
        <RconPanel id={s.id} running={running} />
      </section>

      <section className={`tabpanel ${tab === 'Players' ? '' : 'hidden'}`}>
        {tab === 'Players' && <PlayersPanel id={s.id} />}
      </section>

      <section className={`tabpanel ${tab === 'Pals' ? '' : 'hidden'}`}>
        {tab === 'Pals' && <PalsPanel id={s.id} />}
      </section>

      <section className={`tabpanel ${tab === 'Map' ? '' : 'hidden'}`}>
        {tab === 'Map' && <MapView id={s.id} />}
      </section>

      <section className={`tabpanel ${tab === 'Backups' ? '' : 'hidden'}`}>
        {tab === 'Backups' && <BackupsPanel id={s.id} running={running} />}
      </section>

      <section className={`tabpanel ${tab === 'Settings' ? '' : 'hidden'}`}>
        {tab === 'Settings' && (
          <WorldSettingsPanel id={s.id} running={running} onApplied={() => {}} />
        )}

        <div className="danger-zone">
          <div>
            <b>Delete this server</b>
            <p className="note">
              Removes the container and the entry here. The world volume is kept,
              so a future server can adopt it.
            </p>
          </div>
          <button className="danger" onClick={() => onDelete(s)} disabled={busy}>
            {pending === 'delete' ? <span className="spin" aria-hidden="true" /> : null} Delete
          </button>
        </div>
      </section>

      {showBroadcast && (
        <BroadcastModal id={s.id} name={s.name} onClose={() => setShowBroadcast(false)} />
      )}
    </>
  )
}
