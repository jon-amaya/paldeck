import { useCallback, useEffect, useState } from 'react'
import type { PalPlayer } from '../types'
import { api } from '../api'

import { mapCoord } from '../palData'

// Live online-player list (polled while the tab is open) with kick/ban.
export function PlayersPanel({ id }: { id: string }) {
  const [data, setData] = useState<{ available: boolean; players: PalPlayer[] } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busyUid, setBusyUid] = useState<string | null>(null)

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
    if (!confirm(`${kind === 'kick' ? 'Kick' : 'Ban'} ${p.name}?`)) return
    setBusyUid(p.userId)
    setErr(null)
    try {
      await api.playerAction(id, p.userId, kind)
      await load()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusyUid(null)
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
        <b>Nobody online</b>
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
              <th>Level</th>
              <th>Ping</th>
              <th>Location</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.players.map((p) => (
              <tr key={p.userId}>
                <td className="nm">{p.name}</td>
                <td>{p.level}</td>
                <td className="mono mut">{Math.round(p.ping)} ms</td>
                <td className="mono mut">
                  {(() => {
                    const c = mapCoord(p.location_x, p.location_y)
                    return `${c.x}, ${c.y}`
                  })()}
                </td>
                <td>
                  <button disabled={busyUid === p.userId} onClick={() => act(p, 'kick')}>
                    Kick
                  </button>{' '}
                  <button
                    className="danger"
                    disabled={busyUid === p.userId}
                    onClick={() => act(p, 'ban')}
                  >
                    Ban
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
