import { useCallback, useEffect, useState } from 'react'
import type { PalPlayer } from '../types'
import { api } from '../api'

import { mapCoord } from '../palData'

// Player roster (polled while the tab is open): who's online right now,
// plus everyone who's been seen before but isn't currently connected,
// shown offline with when they were last seen. Kick only makes sense for
// someone actually connected; Ban works for anyone Paldeck has a Steam id
// for, online or not — the whole point of remembering identities is being
// able to ban someone after they've already logged off.
export function PlayersPanel({ id }: { id: string }) {
  const [data, setData] = useState<{ available: boolean; players: PalPlayer[] } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await api.players(id))
    } catch (e) {
      setErr((e as Error).message)
    }
  }, [id])

  useEffect(() => {
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [load])

  const act = async (p: PalPlayer, kind: 'kick' | 'ban') => {
    if (!p.userId) return
    if (!confirm(`${kind === 'kick' ? 'Kick' : 'Ban'} ${p.name}?`)) return
    setBusyId(p.playerId)
    setErr(null)
    try {
      await api.playerAction(id, p.userId, kind)
      await load()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  if (!data) return <div className="placeholder"><b>Players</b><p>loading…</p></div>
  if (!data.available)
    return (
      <div className="placeholder">
        <b>Player list unavailable</b>
        <p>
          The server is stopped, still booting, or was created before the REST
          plumbing (recreate it to enable operator actions).
        </p>
      </div>
    )
  if (data.players.length === 0)
    return (
      <div className="placeholder">
        <b>Nobody's played here yet</b>
        <p>Players appear here the moment they join.</p>
      </div>
    )

  return (
    <>
      {err && <p className="form-err">{err}</p>}
      <div className="stable-wrap">
        <table className="stable">
          <thead>
            <tr>
              <th>Player</th>
              <th>Status</th>
              <th>Level</th>
              <th>Ping</th>
              <th>IP</th>
              <th>Location</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.players.map((p) => (
              <tr key={p.playerId}>
                <td className="nm">{p.name || '(unknown)'}</td>
                <td>
                  {p.online ? (
                    <span className="chip-inline chip-owned">online</span>
                  ) : (
                    <span className="mut" style={{ fontSize: 12.5 }}>
                      offline{p.lastSeen ? ` · seen ${new Date(p.lastSeen).toLocaleString()}` : ''}
                    </span>
                  )}
                </td>
                <td>{p.level ?? '—'}</td>
                <td className="mono mut">{p.ping != null ? `${Math.round(p.ping)} ms` : '—'}</td>
                <td className="mono mut">{p.ip || '—'}</td>
                <td className="mono mut">
                  {p.location_x != null && p.location_y != null
                    ? (() => {
                        const c = mapCoord(p.location_x!, p.location_y!)
                        return `${c.x}, ${c.y}`
                      })()
                    : '—'}
                </td>
                <td>
                  {p.online && (
                    <>
                      <button disabled={busyId === p.playerId} onClick={() => act(p, 'kick')}>
                        Kick
                      </button>{' '}
                    </>
                  )}
                  {p.userId ? (
                    <button
                      className="danger"
                      disabled={busyId === p.playerId}
                      onClick={() => act(p, 'ban')}
                    >
                      Ban
                    </button>
                  ) : (
                    <span className="mut" style={{ fontSize: 12 }} title="Paldeck only learns a Steam id while someone's actually connected — ban becomes available once they've been online at least once">
                      ban needs a reconnect
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
