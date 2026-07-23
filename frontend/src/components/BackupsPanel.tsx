import { useEffect, useState } from 'react'
import type { Backup } from '../types'
import { api } from '../api'

// Parses the image's timestamp folder name "2026.07.20-09.35.28" into a Date.
function parseBackupTs(ts: string): Date | null {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2})$/.exec(ts)
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`)
}

function relTime(d: Date): string {
  const diffSec = (Date.now() - d.getTime()) / 1000
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`
  return `${Math.round(diffSec / 86400)}d ago`
}

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// The image snapshots the world hourly; this surfaces those snapshots for
// listing and one-click restore (with a strong confirm — restore overwrites
// the current world, which is itself not backed up first).
export function BackupsPanel({ id, running }: { id: string; running: boolean }) {
  const [list, setList] = useState<Backup[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busyTs, setBusyTs] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const load = () => {
    api
      .backups(id)
      .then((r) => setList(r.backups))
      .catch((e) => setErr((e as Error).message))
  }
  useEffect(() => {
    setList(null)
    setErr(null)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const restore = async (b: Backup) => {
    const when = parseBackupTs(b.timestamp)
    const label = when ? when.toLocaleString() : b.timestamp
    if (
      !confirm(
        `Restore the world to its state from ${label}?\n\n` +
          `This OVERWRITES the current world — anything since that backup is lost, ` +
          `and the current state is not itself backed up first. ` +
          (running ? 'The server will stop first.' : ''),
      )
    )
      return
    setBusyTs(b.timestamp)
    setErr(null)
    try {
      const r = await api.restoreBackup(id, b.timestamp)
      setStatus(r.status)
      load()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusyTs(null)
    }
  }

  if (err)
    return (
      <div className="placeholder">
        <b>Couldn't load backups</b>
        <p>{err}</p>
      </div>
    )
  if (!list)
    return (
      <div className="skeleton-row">
        <div className="skeleton-bar" style={{ width: '90%' }} />
        <div className="skeleton-bar" style={{ width: '75%' }} />
        <div className="skeleton-bar" style={{ width: '80%' }} />
      </div>
    )
  if (list.length === 0)
    return (
      <div className="placeholder">
        <b>No backups yet</b>
        <p>The server snapshots its world hourly while running — check back after it's been up a while.</p>
      </div>
    )

  return (
    <>
      <p className="note" style={{ marginBottom: 12 }}>
        Snapshots the server takes automatically (hourly, while running).
        Restoring overwrites the current world — it isn't backed up first.
      </p>
      {status && <p className="note" style={{ marginBottom: 12 }}>{status}</p>}
      <div className="stable-wrap">
        <table className="stable">
          <thead>
            <tr>
              <th>Taken</th>
              <th>Size</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((b) => {
              const when = parseBackupTs(b.timestamp)
              return (
                <tr key={b.timestamp}>
                  <td className="nm">
                    {when ? when.toLocaleString() : b.timestamp}
                    {when && <span className="mut" style={{ marginLeft: 8, fontWeight: 500 }}>{relTime(when)}</span>}
                  </td>
                  <td className="mono mut">{fmtSize(b.sizeBytes)}</td>
                  <td>
                    <button onClick={() => restore(b)} disabled={busyTs !== null}>
                      {busyTs === b.timestamp ? (
                        <span className="spin" aria-hidden="true" />
                      ) : (
                        '↺'
                      )}{' '}
                      Restore
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
