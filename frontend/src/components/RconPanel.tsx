import { useState } from 'react'
import { api } from '../api'

interface Entry {
  command: string
  output: string
  error?: boolean
}

const QUICK = ['Info', 'ShowPlayers', 'Save']

// A real RCON console: quick buttons for common read commands, a free-form
// input for anything else, and a local history of what was run and its
// response. One RCON connection per command (see internal/rcon) — this is an
// occasional admin action, not a hot path.
export function RconPanel({ id, running }: { id: string; running: boolean }) {
  const [cmd, setCmd] = useState('')
  const [history, setHistory] = useState<Entry[]>([])
  const [busy, setBusy] = useState(false)

  const run = async (raw: string) => {
    const command = raw.trim()
    if (!command || busy) return
    setBusy(true)
    try {
      const r = await api.rconExec(id, command)
      setHistory((h) => [...h, { command, output: r.output.trim() || '(no output)' }])
    } catch (e) {
      setHistory((h) => [...h, { command, output: (e as Error).message, error: true }])
    } finally {
      setBusy(false)
      setCmd('')
    }
  }

  return (
    <div className="rcon">
      <div className="console-head">
        <span className="console-title">RCON — raw admin commands</span>
        <div className="rcon-quick">
          {QUICK.map((q) => (
            <button key={q} onClick={() => run(q)} disabled={!running || busy}>
              {q}
            </button>
          ))}
        </div>
      </div>
      <div className="term rcon-history">
        {!running ? (
          <div className="term-empty">start the server to run RCON commands</div>
        ) : history.length === 0 ? (
          <div className="term-empty">try “Info” or “ShowPlayers”, or type any command below</div>
        ) : (
          history.map((e, i) => (
            <div className="term-ln" key={i}>
              <span className="rcon-prompt">&gt;</span> {e.command}
              <div className={e.error ? 'rcon-err' : 'rcon-out'}>{e.output}</div>
            </div>
          ))
        )}
      </div>
      <div className="rcon-input">
        <input
          value={cmd}
          onChange={(ev) => setCmd(ev.target.value)}
          onKeyDown={(ev) => ev.key === 'Enter' && run(cmd)}
          placeholder={running ? 'Type an RCON command…' : 'Server is stopped'}
          disabled={!running || busy}
        />
        <button className="solid" onClick={() => run(cmd)} disabled={!running || busy || !cmd.trim()}>
          {busy ? '…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
