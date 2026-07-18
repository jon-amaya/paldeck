import { useState } from 'react'
import type { Server, LifecycleAction, PendingAction } from '../types'
import { PENDING_LABEL } from '../types'
import { LogConsole } from './LogConsole'

const TABS = ['Overview', 'Console', 'Players', 'Settings'] as const
type Tab = (typeof TABS)[number]

// The operator view for one server: header (status + lifecycle actions) and
// tabs. Console mounts as soon as the detail opens — even while you're on
// Overview — so logs are already flowing when you switch to it. Inactive tabs
// are hidden with CSS, not unmounted, so the console never loses its lines.
export function ServerDetail({
  s,
  pending,
  onBack,
  onAction,
  onDelete,
}: {
  s: Server
  pending?: PendingAction
  onBack: () => void
  onAction: (id: string, a: LifecycleAction) => void
  onDelete: (s: Server) => void
}) {
  const [tab, setTab] = useState<Tab>('Overview')
  const running = s.status === 'running'
  const busy = pending !== undefined

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
        <h1>{s.name}</h1>
        <span className={`st ${pending ? 'pend' : running ? 'run' : ''}`}>
          <i />
          {pending ? PENDING_LABEL[pending] : s.status}
        </span>
        <span className="spacer" />
        <div className="acts">
          {actionBtn('start', '▶', 'Start', running)}
          {actionBtn('stop', '■', 'Stop', !running)}
          {actionBtn('restart', '↻', 'Restart', false)}
        </div>
      </div>

      <nav className="tabs" aria-label="Server sections">
        {TABS.map((t) => (
          <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>

      <section className={tab === 'Overview' ? '' : 'hidden'}>
        {s.description && <p className="desc">{s.description}</p>}
        <div className="tiles">
          <div className="tile soon"><small>Players</small><b>— / {s.maxPlayers}</b></div>
          <div className="tile soon"><small>Uptime</small><b>—</b></div>
          <div className="tile soon"><small>CPU</small><b>—</b></div>
          <div className="tile soon"><small>Memory</small><b>—</b></div>
          <div className="tile"><small>Game port</small><b className="mono">:{s.gamePort}</b></div>
          <div className="tile"><small>Query port</small><b className="mono">:{s.queryPort}</b></div>
          <div className="tile"><small>RCON port</small><b className="mono">:{s.rconPort}</b></div>
          <div className="tile"><small>Difficulty</small><b>{s.difficulty}{s.pvp ? ' · PvP' : ''}</b></div>
          <div className="tile"><small>Created</small><b>{new Date(s.createdAt).toLocaleDateString()}</b></div>
          <div className="tile"><small>Container</small><b className="mono">{s.containerId ? s.containerId.slice(0, 12) : '—'}</b></div>
        </div>
        <p className="tiles-note">
          Players, uptime, CPU &amp; memory go live with the operator controls
          (Docker stats + the Palworld REST API).
        </p>
      </section>

      <section className={tab === 'Console' ? '' : 'hidden'}>
        <LogConsole id={s.id} name={s.name} />
      </section>

      <section className={tab === 'Players' ? '' : 'hidden'}>
        <div className="placeholder">
          <b>Players</b>
          <p>
            Online player list with level, ping and location — plus kick &amp;
            ban — lands here with the operator controls (Palworld REST API + RCON).
          </p>
        </div>
      </section>

      <section className={tab === 'Settings' ? '' : 'hidden'}>
        <div className="tiles">
          <div className="tile"><small>Server name</small><b>{s.name}</b></div>
          <div className="tile"><small>Description</small><b>{s.description || '—'}</b></div>
          <div className="tile"><small>Max players</small><b>{s.maxPlayers}</b></div>
          <div className="tile"><small>Difficulty</small><b>{s.difficulty}</b></div>
          <div className="tile"><small>PvP</small><b>{s.pvp ? 'On' : 'Off'}</b></div>
        </div>
        <p className="note">
          Editing settings after create (and the full world-settings editor) is a
          planned feature — for now, settings are fixed at creation.
        </p>

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
    </>
  )
}
