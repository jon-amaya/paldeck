import { useCallback, useEffect, useState } from 'react'
import './theme.css'
import logo from './assets/logo.png'
import type { CreatedServer, CreateServerInput, LifecycleAction, PendingAction, Server } from './types'
import { api } from './api'
import { ServerRow } from './components/ServerRow'
import { ServerDetail } from './components/ServerDetail'
import { NewServerModal } from './components/NewServerModal'
import { CreatedModal } from './components/CreatedModal'

// Sidebar nav icons — simple 24px strokes, colored via currentColor.
const IcServers = () => (
  <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="7" rx="1.5" /><rect x="3" y="13" width="18" height="7" rx="1.5" /><path d="M7 7.5h.01M7 16.5h.01" /></svg>
)
const IcPaw = () => (
  <svg viewBox="0 0 24 24"><circle cx="12" cy="15" r="3.4" /><circle cx="6" cy="9.6" r="1.9" /><circle cx="10.2" cy="6.4" r="1.9" /><circle cx="13.8" cy="6.4" r="1.9" /><circle cx="18" cy="9.6" r="1.9" /></svg>
)
const IcMap = () => (
  <svg viewBox="0 0 24 24"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14M15 6v14" /></svg>
)
const IcGear = () => (
  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" /></svg>
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
  // The success dialog reveals the admin password once, right after create.
  const [created, setCreated] = useState<CreatedServer | null>(null)

  // Poll the list every 5s. Re-renders never unmount an open LogConsole.
  const refresh = useCallback(async () => {
    try {
      setServers(await api.list())
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 5000)
    return () => clearInterval(t)
  }, [refresh])

  // Throws on failure so the modal can show the error and stay open.
  const createServer = async (input: CreateServerInput) => {
    const res = await api.create(input)
    setCreated(res)
    await refresh()
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
        <button className={`nav ${openId === null ? 'on' : ''}`} onClick={() => setOpenId(null)}>
          <span className="ic"><IcServers /></span> Servers
        </button>
        <div className="subnav">
          {servers.map((s) => (
            <button
              key={s.id}
              className={`subitem ${s.status === 'running' ? 'run' : ''} ${openId === s.id ? 'on' : ''}`}
              onClick={() => setOpenId(s.id)}
            >
              <i /> {s.name}
            </button>
          ))}
        </div>
        <div className="nav soon" title="Pal search — planned">
          <span className="ic"><IcPaw /></span> Pals <span className="soon-tag">soon</span>
        </div>
        <div className="nav soon" title="World map — planned">
          <span className="ic"><IcMap /></span> Map <span className="soon-tag">soon</span>
        </div>

        <div className="sect">System</div>
        <div className="nav soon" title="App settings — planned">
          <span className="ic"><IcGear /></span> Settings <span className="soon-tag">soon</span>
        </div>

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
        {open ? (
          <ServerDetail
            s={open}
            pending={pending[open.id]}
            onBack={() => setOpenId(null)}
            onAction={action}
            onDelete={remove}
          />
        ) : (
          <>
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
              <div className="stable-wrap">
                <table className="stable">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Players</th>
                      <th>Ports</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {servers.map((s) => (
                      <ServerRow
                        key={s.id}
                        s={s}
                        pending={pending[s.id]}
                        onAction={action}
                        onOpen={setOpenId}
                      />
                    ))}
                  </tbody>
                </table>
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
