import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import './theme.css'
import logo from './assets/logo.png'
import { ACCENTS, applyAccent, getSavedAccentId } from './accent'
import type {
  CreatedServer,
  CreateServerInput,
  HostStats,
  LifecycleAction,
  PendingAction,
  Server,
  ServerMetrics,
} from './types'
import { api } from './api'
import { ServerCard } from './components/ServerRow'
import { ServerDetail, type DetailTab } from './components/ServerDetail'
import { NewServerModal } from './components/NewServerModal'
import { CreatedModal } from './components/CreatedModal'
import { HostCard } from './components/HostCard'

const APP_VERSION = 'v0.4-dev'

// Sidebar nav icons — simple 24px strokes, colored via currentColor.
const IcServers = () => (
  <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="7" rx="1.5" /><rect x="3" y="13" width="18" height="7" rx="1.5" /><path d="M7 7.5h.01M7 16.5h.01" /></svg>
)
const IcPaw = () => (
  <svg viewBox="0 0 24 24"><circle cx="12" cy="15" r="3.4" /><circle cx="6" cy="9.6" r="1.9" /><circle cx="10.2" cy="6.4" r="1.9" /><circle cx="13.8" cy="6.4" r="1.9" /><circle cx="18" cy="9.6" r="1.9" /></svg>
)
const IcEgg = () => (
  <svg viewBox="0 0 24 24"><path d="M12 21c4.4 0 7-3.4 7-8 0-6-4-11-7-11S5 7 5 13c0 4.6 2.6 8 7 8z" /></svg>
)
const IcMap = () => (
  <svg viewBox="0 0 24 24"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14M15 6v14" /></svg>
)
const IcGear = () => (
  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" /></svg>
)
const IcPulse = () => (
  <svg viewBox="0 0 24 24"><path d="M3 12h4l2-7 4 14 2-7h6" /></svg>
)
const IcUsers = () => (
  <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><circle cx="17" cy="9" r="2.6" /><path d="M15.5 14.2c2.7.3 4.9 2.5 4.9 5.8" /></svg>
)

export default function App() {
  const [servers, setServers] = useState<Server[]>([])
  const [showNew, setShowNew] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // id → in-flight action; drives spinners/disabled buttons. A graceful Stop
  // can take ~90s, so this feedback is essential.
  const [pending, setPending] = useState<Record<string, PendingAction>>({})
  // Navigation without a router: null = server list, otherwise the open
  // server's id. The detail always renders fresh data from the polled list.
  const [openId, setOpenId] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<DetailTab | undefined>(undefined)
  const [showSettings, setShowSettings] = useState(false)
  // Per-running-server metrics for the home stats + live player counts.
  const [metricsById, setMetricsById] = useState<Record<string, ServerMetrics>>({})
  // Host-wide resources (memory/disk/network) for the overview's Host card.
  const [hostStats, setHostStats] = useState<HostStats | undefined>(undefined)
  // The success dialog reveals the admin password once, right after create.
  const [created, setCreated] = useState<CreatedServer | null>(null)

  // Poll the list every 5s. Re-renders never unmount an open LogConsole.
  const refresh = useCallback(async () => {
    try {
      const list = await api.list()
      setServers(list)
      // metrics for running servers, in parallel; failures just leave gaps
      const running = list.filter((s) => s.status === 'running')
      const results = await Promise.allSettled(running.map((s) => api.metrics(s.id)))
      const m: Record<string, ServerMetrics> = {}
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') m[running[i].id] = r.value
      })
      setMetricsById(m)
    } catch (e) {
      setError((e as Error).message)
    }
    // Best-effort, separate from the try/catch above — a host-stats hiccup
    // shouldn't surface as the same error toast as a server-list failure.
    api.hostStats().then(setHostStats).catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 5000)
    return () => clearInterval(t)
  }, [refresh])

  // Throws on failure so the modal can show the error and stay open. Returns
  // the created server so the modal can chain an import-save call onto it.
  const createServer = async (input: CreateServerInput) => {
    const res = await api.create(input)
    setCreated(res)
    await refresh()
    return res
  }

  const action = async (id: string, a: LifecycleAction) => {
    setPending((p) => ({ ...p, [id]: a }))
    try {
      await api.action(id, a) // resolves when Docker finishes (Stop ≈ up to 30s)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPending((p) => {
        const next = { ...p }
        delete next[id]
        return next
      })
    }
  }

  const remove = async (s: Server) => {
    if (!confirm(`Delete ${s.name}? (the world volume is kept)`)) return
    setPending((p) => ({ ...p, [s.id]: 'delete' }))
    try {
      await api.remove(s.id)
      setOpenId((id) => (id === s.id ? null : id)) // back to the list if open
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPending((p) => {
        const next = { ...p }
        delete next[s.id]
        return next
      })
    }
  }

  const open = servers.find((x) => x.id === openId)
  const runningCount = servers.filter((x) => x.status === 'running').length
  const playersOnline = Object.values(metricsById).reduce((n, m) => n + (m.players ?? 0), 0)

  // one navigation door: switching view always resets the settings page and
  // the deep-link tab intent
  const openServer = (id: string | null, tab?: DetailTab) => {
    setShowSettings(false)
    setDetailTab(tab)
    setOpenId(id)
  }
  const openFirstAt = (tab: DetailTab) => {
    const target = servers.find((s) => s.status === 'running') ?? servers[0]
    if (!target) {
      setError('Create a server first — Pals and Map live inside a server.')
      return
    }
    openServer(target.id, tab)
  }

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <img src={logo} alt="" />
          <b>
            Paldeck
            <small>server console</small>
          </b>
        </div>

        <div className="sect">Manage</div>
        <button
          className={`nav ${openId === null && !showSettings ? 'on' : ''}`}
          onClick={() => openServer(null)}
        >
          <span className="ic"><IcServers /></span> Servers
        </button>
        <div className="subnav">
          {servers.map((s) => (
            <button
              key={s.id}
              className={`subitem ${s.status === 'running' ? 'run' : ''} ${openId === s.id && !showSettings ? 'on' : ''}`}
              onClick={() => openServer(s.id)}
            >
              <i /> {s.name}
            </button>
          ))}
        </div>
        <button className="nav" onClick={() => openFirstAt('Breeding')} title="Breeding calculator">
          <span className="ic"><IcEgg /></span> Breeding
        </button>
        <button className="nav" onClick={() => openFirstAt('Pals')} title="Pal search">
          <span className="ic"><IcPaw /></span> Pals
        </button>
        <button className="nav" onClick={() => openFirstAt('Map')} title="World map">
          <span className="ic"><IcMap /></span> Map
        </button>

        <div className="sect">System</div>
        <button
          className={`nav ${showSettings ? 'on' : ''}`}
          onClick={() => setShowSettings(true)}
          title="Panel info & settings"
        >
          <span className="ic"><IcGear /></span> Settings
        </button>

        <div className="side-foot">
          <i className={runningCount > 0 ? 'up' : ''} /> docker · {runningCount} of {servers.length} running
        </div>
      </aside>

      <div className="content">
        <div className="mbar">
          <img src={logo} alt="" />
          <b>Paldeck</b>
          <span className="mbar-status">
            <i className={runningCount > 0 ? 'up' : ''} /> {runningCount} of {servers.length} running
          </span>
        </div>
        {showSettings ? (
          <AppSettings servers={servers} running={runningCount} />
        ) : open ? (
          <ServerDetail
            s={open}
            pending={pending[open.id]}
            initialTab={detailTab}
            onBack={() => openServer(null)}
            onAction={action}
            onDelete={remove}
          />
        ) : (
          <>
            <HostCard stats={hostStats} />
            <div className="stat-grid">
              <div className="stat-tile">
                <span className="stat-ic"><IcServers /></span>
                <div><small>Servers</small><b>{servers.length}</b></div>
              </div>
              <div className={`stat-tile ${runningCount > 0 ? 'stat-good' : ''}`}>
                <span className="stat-ic"><IcPulse /></span>
                <div><small>Running</small><b>{runningCount}</b></div>
              </div>
              <div className={`stat-tile ${playersOnline > 0 ? 'stat-accent' : ''}`}>
                <span className="stat-ic"><IcUsers /></span>
                <div><small>Players online</small><b>{playersOnline}</b></div>
              </div>
              <div className="stat-tile">
                <span className="stat-ic"><IcGear /></span>
                <div><small>Panel</small><b className="mono">{APP_VERSION}</b></div>
              </div>
            </div>
            <div className="mhead">
              <h1>Servers</h1>
              <button className="solid" onClick={() => setShowNew(true)}>
                + New server
              </button>
            </div>

            {servers.length === 0 ? (
              <div className="empty">
                No servers yet. Hit <b>+ New server</b> — the first one pulls the Palworld image.
              </div>
            ) : (
              <div className="cards">
                {servers.map((s) => (
                  <ServerCard
                    key={s.id}
                    s={s}
                    pending={pending[s.id]}
                    metrics={metricsById[s.id]}
                    onAction={action}
                    onOpen={(sid) => openServer(sid)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {showNew && <NewServerModal onClose={() => setShowNew(false)} onCreate={createServer} />}
      {created && <CreatedModal s={created} onClose={() => setCreated(null)} />}
      {error && (
        <div className="toast" onClick={() => setError(null)}>
          {error}
        </div>
      )}
    </div>
  )
}

// Panel-level info page (sidebar → Settings). Real knobs (auth, listen
// address, backup policy) arrive with the sharing work — spec 005.
function AppSettings({ servers, running }: { servers: Server[]; running: number }) {
  const [accentId, setAccentId] = useState(getSavedAccentId)

  const pickAccent = (id: string) => {
    applyAccent(id)
    setAccentId(id)
  }

  return (
    <>
      <div className="mhead">
        <h1>Settings</h1>
      </div>

      <div className="pd-label" style={{ marginTop: 4 }}>Appearance</div>
      <div className="accent-row">
        {ACCENTS.map((a) => (
          <button
            key={a.id}
            className={`accent-swatch ${accentId === a.id ? 'on' : ''}`}
            style={{ background: a.acc, '--asw': a.acc } as CSSProperties}
            onClick={() => pickAccent(a.id)}
            title={a.name}
            aria-label={`Accent: ${a.name}`}
          />
        ))}
        <span className="note" style={{ marginLeft: 4 }}>{ACCENTS.find((a) => a.id === accentId)?.name}</span>
      </div>

      <div className="pd-label" style={{ marginTop: 20 }}>Panel info</div>
      <div className="tiles">
        <div className="tile"><small>Panel</small><b>Paldeck {APP_VERSION}</b></div>
        <div className="tile"><small>Servers</small><b>{servers.length} ({running} running)</b></div>
        <div className="tile"><small>Runtime</small><b>Docker Engine · local</b></div>
        <div className="tile"><small>State</small><b className="mono">paldeck.db</b></div>
        <div className="tile"><small>Server image</small><b className="mono">thijsvanloef/palworld-server-docker</b></div>
        <div className="tile"><small>Port pools</small><b className="mono">8211+ · 27015+ · 25575+ · 8212+</b></div>
      </div>
      <p className="note" style={{ marginTop: 14 }}>
        Panel configuration (listen address, database path) is set via the
        <span className="mono"> PALDECK_ADDR</span> and
        <span className="mono"> PALDECK_DB</span> environment variables.
        Authentication and remote access land with the sharing work (spec 005).
        Project docs: <span className="mono">docs/CONSTITUTION.md</span> ·{' '}
        <span className="mono">docs/ROADMAP.md</span> ·{' '}
        <span className="mono">specs/</span>.
      </p>
    </>
  )
}
