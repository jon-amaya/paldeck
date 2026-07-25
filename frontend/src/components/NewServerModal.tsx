import { useState } from 'react'
import type { CreateServerInput } from '../types'
import { Toggle } from './Toggle'

const DIFFICULTIES = ['None', 'Normal', 'Difficult'] as const

// Section icons — same 24px stroke style as the sidebar/stat-tile icons.
const IcTag = () => (
  <svg viewBox="0 0 24 24"><path d="M3 12V4h8l10 10-8 8L3 12z" /><circle cx="7.5" cy="8.5" r="1.3" /></svg>
)
const IcSliders = () => (
  <svg viewBox="0 0 24 24"><path d="M4 6h10M17 6h3M4 12h3M9 12h11M4 18h13M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="6" cy="12" r="2" /><circle cx="17" cy="18" r="2" /></svg>
)
const IcLock = () => (
  <svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
)
const IcGlobe = () => (
  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 4 6 4 9s-1.5 6.5-4 9c-2.5-2.5-4-6-4-9s1.5-6.5 4-9z" /></svg>
)

// The real create flow: a modal that collects Palworld settings (not just a
// name). Ports stay auto-assigned by the backend. Admin password auto-generates
// when left blank. onCreate throws on failure so we can show the error inline.
export function NewServerModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (input: CreateServerInput) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(16)
  const [serverPassword, setServerPassword] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [difficulty, setDifficulty] = useState<string>('None')
  const [pvp, setPvp] = useState(false)
  const [timezone, setTimezone] = useState('')
  const [multithreading, setMultithreading] = useState(true)
  const [community, setCommunity] = useState(false)
  const [publicIp, setPublicIp] = useState('')
  const [gamePort, setGamePort] = useState('')
  const [queryPort, setQueryPort] = useState('')
  const [rconPort, setRconPort] = useState('')
  const [restApiPort, setRestApiPort] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    if (!name.trim()) {
      setErr('Give your server a name.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const worldSettings: Record<string, string> = {
        MULTITHREADING: multithreading ? 'True' : 'False',
        COMMUNITY: community ? 'True' : 'False',
      }
      if (timezone.trim()) worldSettings.TZ = timezone.trim()
      if (publicIp.trim()) worldSettings.PUBLIC_IP = publicIp.trim()
      await onCreate({
        name: name.trim(),
        description: description.trim() || undefined,
        maxPlayers,
        serverPassword: serverPassword.trim() || undefined,
        adminPassword: adminPassword.trim() || undefined,
        difficulty,
        pvp,
        worldSettings,
        gamePort: gamePort.trim() ? Number(gamePort) : undefined,
        queryPort: queryPort.trim() ? Number(queryPort) : undefined,
        rconPort: rconPort.trim() ? Number(rconPort) : undefined,
        restApiPort: restApiPort.trim() ? Number(restApiPort) : undefined,
      })
      onClose()
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="New server"
      >
        <div className="modal-head">
          <div className="modal-head-text">
            <h2>New server</h2>
            <span className="modal-sub">Spin up a fresh Palworld dedicated server</span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="form">
          <div className="formcard">
            <div className="formcard-head">
              <span className="formcard-ic"><IcTag /></span>
              <b>Identity</b>
            </div>
            <label className="field">
              <span>Server name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. torta-slayers"
                autoFocus
              />
            </label>
            <label className="field" style={{ marginTop: 12 }}>
              <span>
                Description <em>optional</em>
              </span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Shown in the in-game server browser"
              />
            </label>
          </div>

          <div className="formcard">
            <div className="formcard-head">
              <span className="formcard-ic"><IcSliders /></span>
              <b>Game rules</b>
            </div>
            <div className="field-row">
              <label className="field">
                <span>Max players</span>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(Number(e.target.value))}
                />
              </label>
              <label className="field">
                <span>Difficulty</span>
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                  {DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="opt-row" style={{ borderBottom: 0, padding: '12px 0 0' }}>
              <div className="opt-info">
                <p className="opt-name">PvP mode</p>
                <p className="opt-key">Player-vs-player damage</p>
              </div>
              <div className="opt-ctl">
                <Toggle checked={pvp} onChange={setPvp} />
              </div>
            </div>
          </div>

          <div className="formcard">
            <div className="formcard-head">
              <span className="formcard-ic"><IcGlobe /></span>
              <b>Network</b>
            </div>
            <div className="field-row">
              <label className="field">
                <span>
                  Game port <em>optional</em>
                </span>
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={gamePort}
                  onChange={(e) => setGamePort(e.target.value)}
                  placeholder="auto"
                />
              </label>
              <label className="field">
                <span>
                  Query port <em>optional</em>
                </span>
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={queryPort}
                  onChange={(e) => setQueryPort(e.target.value)}
                  placeholder="auto"
                />
              </label>
            </div>
            <div className="field-row" style={{ marginTop: 12 }}>
              <label className="field">
                <span>
                  RCON port <em>optional</em>
                </span>
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={rconPort}
                  onChange={(e) => setRconPort(e.target.value)}
                  placeholder="auto"
                />
              </label>
              <label className="field">
                <span>
                  REST API port <em>optional</em>
                </span>
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={restApiPort}
                  onChange={(e) => setRestApiPort(e.target.value)}
                  placeholder="auto"
                />
              </label>
            </div>
            <p className="note" style={{ margin: '6px 0 0' }}>
              Each port is independent — leave any blank to auto-assign it, or pin
              specific ones to forward on your router ahead of time. RCON/REST are
              loopback-only regardless (never reachable off this host).
            </p>
            <label className="field" style={{ marginTop: 12 }}>
              <span>
                Timezone <em>optional</em>
              </span>
              <input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="e.g. America/Chicago"
              />
            </label>
            <label className="field" style={{ marginTop: 12 }}>
              <span>
                Public IP <em>optional</em>
              </span>
              <input
                value={publicIp}
                onChange={(e) => setPublicIp(e.target.value)}
                placeholder="Only needed if this server is reachable from the internet"
              />
            </label>
            <div className="opt-row" style={{ borderBottom: 0, padding: '12px 0 0' }}>
              <div className="opt-info">
                <p className="opt-name">Multithreading</p>
                <p className="opt-key">Better performance on multi-core hosts</p>
              </div>
              <div className="opt-ctl">
                <Toggle checked={multithreading} onChange={setMultithreading} />
              </div>
            </div>
            <div className="opt-row" style={{ borderBottom: 0, padding: '10px 0 0' }}>
              <div className="opt-info">
                <p className="opt-name">Public server browser</p>
                <p className="opt-key">List this server in Palworld's in-game community list</p>
              </div>
              <div className="opt-ctl">
                <Toggle checked={community} onChange={setCommunity} />
              </div>
            </div>
          </div>

          <div className="formcard">
            <div className="formcard-head">
              <span className="formcard-ic"><IcLock /></span>
              <b>Access</b>
            </div>
            <label className="field">
              <span>
                Join password <em>optional</em>
              </span>
              <input
                value={serverPassword}
                onChange={(e) => setServerPassword(e.target.value)}
                placeholder="Leave blank for a public server"
              />
            </label>
            <label className="field" style={{ marginTop: 12 }}>
              <span>
                Admin password <em>optional</em>
              </span>
              <input
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Auto-generated if left blank"
              />
            </label>
          </div>

          {err && <div className="form-err">{err}</div>}
        </div>

        <div className="modal-foot">
          <button onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="solid" onClick={submit} disabled={busy}>
            {busy ? 'Creating…' : 'Create server'}
          </button>
        </div>
      </div>
    </div>
  )
}
