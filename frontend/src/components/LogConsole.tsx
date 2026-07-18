import { useEffect, useRef, useState } from 'react'

// LogConsole owns its own state (the accumulated lines) and its WebSocket,
// both scoped to one server id via useEffect. When the parent re-renders on a
// background poll, React keeps this mounted — lines and socket survive.
const MAX_LINES = 1000 // cap memory; drop the oldest beyond this

// ── ANSI colors → console-palette hex ──────────────────────────────────────
// Container logs come from a TTY, so they carry ANSI SGR escape sequences
// (ESC[1;36m = bold cyan…). We interpret the common ones instead of showing
// them as garbage: 0 reset · 1 bold · 30-37 colors · 90-97 bright colors.
type Seg = { text: string; color?: string; bold?: boolean }

const ANSI_COLORS: Record<number, string> = {
  30: '#6b7280', 31: '#e0655b', 32: '#3fbf7f', 33: '#e0a63c',
  34: '#7ca7f2', 35: '#c07cf2', 36: '#5ec8d8', 37: '#c2c7d0',
  90: '#7a7e88', 91: '#ef8a80', 92: '#5fd49a', 93: '#eec06a',
  94: '#9dbcf6', 95: '#d29df6', 96: '#7fdbe8', 97: '#eceef2',
}

type Line = { ts?: string; segs: Seg[] }

// Docker prepends an RFC3339Nano timestamp to every line (Timestamps: true in
// the backend) — real daemon-side emit times, valid even for the backlog.
// Peel it off and format as local HH:MM:SS for the gutter.
const TS_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))\s?/

function parseLine(raw: string): Line {
  const m = TS_RE.exec(raw)
  if (!m) return { segs: parseAnsi(raw) }
  const d = new Date(m[1])
  const ts = isNaN(d.getTime())
    ? undefined
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  return { ts, segs: parseAnsi(raw.slice(m[0].length)) }
}

function parseAnsi(raw: string): Seg[] {
  // A TTY stream can carry \r progress overwrites — what's after the last \r
  // is what a real terminal would show. Then drop non-color escapes (cursor
  // moves, line clears) entirely.
  let line = raw.split('\r').pop() ?? ''
  line = line.replace(/\x1b\[[0-9;]*[A-LN-Za-ln-z]/g, '')

  const segs: Seg[] = []
  const re = /\x1b\[([0-9;]*)m/g
  let last = 0
  let color: string | undefined
  let bold = false
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) {
    if (m.index > last) segs.push({ text: line.slice(last, m.index), color, bold })
    for (const part of (m[1] || '0').split(';')) {
      const n = Number(part || '0')
      if (n === 0) { color = undefined; bold = false }
      else if (n === 1) bold = true
      else if (ANSI_COLORS[n]) color = ANSI_COLORS[n]
    }
    last = re.lastIndex
  }
  if (last < line.length) segs.push({ text: line.slice(last), color, bold })
  return segs
}

export function LogConsole({ id, name }: { id: string; name: string }) {
  // Lines are parsed once on arrival and stored as styled segments — renders
  // (which happen on every new line) never re-parse the backlog.
  const [lines, setLines] = useState<Line[]>([])
  const [connected, setConnected] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/api/servers/${id}/logs`)
    ws.onopen = () => setConnected(true)
    ws.onmessage = (e) =>
      setLines((prev) => [...prev, parseLine(e.data as string)].slice(-MAX_LINES))
    ws.onclose = () => setConnected(false)
    return () => ws.close()
  }, [id])

  // Auto-scroll to the bottom whenever new lines arrive.
  useEffect(() => {
    const el = boxRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  return (
    <div className="console">
      <div className="console-head">
        <span className="console-title">
          <span className={`conn ${connected ? 'conn-on' : ''}`} />
          console · {name}
          <span className="console-count">{lines.length} lines</span>
        </span>
        <button className="console-clear" onClick={() => setLines([])} disabled={!lines.length}>
          Clear
        </button>
      </div>
      <div className="term" ref={boxRef}>
        {lines.length === 0 ? (
          <div className="term-empty">
            {connected
              ? 'connected — waiting for output… (start the server if it’s stopped)'
              : 'connecting…'}
          </div>
        ) : (
          lines.map((ln, i) => (
            <div className="term-ln" key={i}>
              {ln.ts && <span className="term-ts">{ln.ts}</span>}
              {ln.segs.map((g, j) => (
                <span key={j} style={{ color: g.color, fontWeight: g.bold ? 600 : undefined }}>
                  {g.text}
                </span>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
