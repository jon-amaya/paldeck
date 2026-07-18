import { useState } from 'react'
import type { CreateServerInput } from '../types'

const DIFFICULTIES = ['None', 'Normal', 'Difficult'] as const

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
      await onCreate({
        name: name.trim(),
        description: description.trim() || undefined,
        maxPlayers,
        serverPassword: serverPassword.trim() || undefined,
        adminPassword: adminPassword.trim() || undefined,
        difficulty,
        pvp,
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
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="New server"
      >
        <div className="modal-head">
          <h2>New server</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="form">
          <label className="field">
            <span>Server name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. torta-slayers"
              autoFocus
            />
          </label>

          <label className="field">
            <span>
              Description <em>optional</em>
            </span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Shown in the in-game server browser"
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span>Max players</span>
              <input
                type="number"
                min={1}
                max={32}
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

          <label className="field">
            <span>
              Admin password <em>optional</em>
            </span>
            <input
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Auto-generated if left blank"
            />
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={pvp}
              onChange={(e) => setPvp(e.target.checked)}
            />
            <span>Enable PvP (player-vs-player damage)</span>
          </label>

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
