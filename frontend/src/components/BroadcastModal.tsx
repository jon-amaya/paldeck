import { useState } from 'react'
import { api } from '../api'

// Send an in-game announcement to everyone on the server.
export function BroadcastModal({
  id,
  name,
  onClose,
}: {
  id: string
  name: string
  onClose: () => void
}) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const send = async () => {
    if (!message.trim()) {
      setErr('Type a message first.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await api.broadcast(id, message.trim())
      setSent(true)
      setTimeout(onClose, 900) // brief "Sent ✓" then close
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Broadcast">
        <div className="modal-head">
          <h2>Broadcast to {name}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="form">
          <label className="field">
            <span>Message <em>shown in-game to all players</em></span>
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="e.g. Server restarting in 10 minutes!"
              autoFocus
            />
          </label>
          {err && <div className="form-err">{err}</div>}
        </div>
        <div className="modal-foot">
          <button onClick={onClose} disabled={busy}>Cancel</button>
          <button className="solid" onClick={send} disabled={busy || sent}>
            {sent ? 'Sent ✓' : busy ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
