import { useState } from 'react'
import type { CreatedServer } from '../types'

// Shown once, right after a successful create: confirms the server and reveals
// the auto-generated admin password — the only time it's ever displayed.
export function CreatedModal({
  s,
  onClose,
}: {
  s: CreatedServer
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(s.adminPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard can be unavailable on plain http; the text is selectable
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Server created"
      >
        <div className="modal-head">
          <h2>{s.name} is ready</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="form">
          <div className="modal-note">
            Ports — game <b>:{s.gamePort}</b> · query <b>:{s.queryPort}</b> · rcon{' '}
            <b>:{s.rconPort}</b>
          </div>

          <label className="field">
            <span>Admin password</span>
            <div className="pw-row">
              <code className="pw">{s.adminPassword}</code>
              <button onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
            </div>
          </label>

          <div className="modal-note">
            This is the <b>only time</b> it's shown — save it somewhere. You'll
            need it to run admin commands in-game.
          </div>
        </div>

        <div className="modal-foot">
          <button className="solid" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
