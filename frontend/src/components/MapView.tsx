import { useEffect, useMemo, useRef, useState } from 'react'
import type { PalPlayer } from '../types'
import { api } from '../api'
import { loadPalData, mapCoord, mapToPct, type PalGameData } from '../palData'

// Live world map: the full map image with online players (polled) and, when a
// species is picked, its wild spawn points. Pan by dragging, zoom with the
// wheel or buttons. All placement runs through the calibrated transform.
export function MapView({ id }: { id: string }) {
  const [players, setPlayers] = useState<PalPlayer[]>([])
  const [gd, setGd] = useState<PalGameData | null>(null)
  const [speciesQ, setSpeciesQ] = useState('')
  const [showLandmarks, setShowLandmarks] = useState(true)
  const [showBosses, setShowBosses] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [fit, setFit] = useState(520) // px size of the map at 1× = fully visible
  const wrapRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; sl: number; st: number } | null>(null)

  // 1× means "the whole (square) map fits in the panel"; zoom scales up from there.
  useEffect(() => {
    const measure = () => {
      const el = wrapRef.current
      if (el) setFit(Math.max(200, Math.min(el.clientWidth, el.clientHeight) - 2))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  useEffect(() => {
    let live = true
    const load = async () => {
      try {
        const r = await api.players(id)
        if (live) setPlayers(r.players)
      } catch {
        /* map still works without live players */
      }
    }
    load()
    const t = setInterval(load, 5000)
    loadPalData().then((d) => live && setGd(d))
    return () => {
      live = false
      clearInterval(t)
    }
  }, [id])

  // species options that actually have wild spawns
  const options = useMemo(() => {
    if (!gd) return []
    const out: { key: string; name: string }[] = []
    for (const [key, info] of gd.species) {
      if ((gd.spawns.get(key)?.length ?? 0) > 0) out.push({ key, name: info.name })
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }, [gd])

  const selected = useMemo(() => {
    if (!gd || !speciesQ.trim()) return null
    const needle = speciesQ.trim().toLowerCase()
    const hit = options.find((o) => o.name.toLowerCase() === needle) ??
      options.find((o) => o.name.toLowerCase().startsWith(needle))
    if (!hit) return null
    return { name: hit.name, points: gd.spawns.get(hit.key) ?? [] }
  }, [gd, options, speciesQ])

  const onPointerDown = (e: React.PointerEvent) => {
    const el = wrapRef.current
    if (!el) return
    drag.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const el = wrapRef.current
    if (!el || !drag.current) return
    el.scrollLeft = drag.current.sl - (e.clientX - drag.current.x)
    el.scrollTop = drag.current.st - (e.clientY - drag.current.y)
  }
  const onPointerUp = () => (drag.current = null)
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    setZoom((z) => Math.min(8, Math.max(1, z + (e.deltaY < 0 ? 0.5 : -0.5))))
  }

  return (
    <>
      <div className="map-bar">
        <input
          list="map-species"
          value={speciesQ}
          onChange={(e) => setSpeciesQ(e.target.value)}
          placeholder="Show spawns of… (e.g. Anubis)"
        />
        <datalist id="map-species">
          {options.map((o) => (
            <option key={o.key} value={o.name} />
          ))}
        </datalist>
        {selected && (
          <span className="map-note">
            {selected.points.length} spawn points for {selected.name}
          </span>
        )}
        <label className="toggle">
          <input
            type="checkbox"
            checked={showLandmarks}
            onChange={(e) => setShowLandmarks(e.target.checked)}
          />
          <span>landmarks</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={showBosses}
            onChange={(e) => setShowBosses(e.target.checked)}
          />
          <span>bosses</span>
        </label>
        <span className="spacer" />
        <button onClick={() => setZoom((z) => Math.max(1, z - 0.5))}>−</button>
        <span className="map-zoom mono">{zoom.toFixed(1)}×</span>
        <button onClick={() => setZoom((z) => Math.min(8, z + 0.5))}>+</button>
      </div>

      <div
        className="map-wrap"
        ref={wrapRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
      >
        <div className="map-inner" style={{ width: `${fit * zoom}px` }}>
          <img className="map-img" src="/game-data/map.jpg" alt="Palworld world map" draggable={false} />

          {showLandmarks &&
            gd?.landmarks.map((lm, i) => {
              const pos = mapToPct(lm.x, lm.y)
              const icon =
                lm.type === 'Dungeon' ? 'dungeon.png' : lm.type === 'Tower' ? 'tower.png' : 'fasttravel.png'
              return (
                <img
                  key={`lm${i}`}
                  className="mk mk-lm"
                  src={`/game-data/landmark-icons/${icon}`}
                  style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
                  title={lm.name.en || lm.type}
                  alt=""
                  draggable={false}
                />
              )
            })}

          {showBosses &&
            gd?.bosses.map((b, i) => {
              const pos = mapToPct(b.x, b.y)
              return (
                <span
                  key={`b${i}`}
                  className="mk mk-boss"
                  style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
                  title={`${b.name.en} · lv ${b.lv}`}
                >
                  <img src={`/game-data/pals/${b.icon}`} alt="" draggable={false} />
                  <b>{b.lv}</b>
                </span>
              )
            })}

          {selected &&
            selected.points.map((s, i) => {
              const pos = mapToPct(s.x, s.y)
              return (
                <span
                  key={i}
                  className="mk mk-spawn"
                  style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
                  title={`${selected.name} · ${s.x}, ${s.y}`}
                />
              )
            })}

          {players.map((p) => {
            const mc = mapCoord(p.location_x, p.location_y)
            const pos = mapToPct(mc.x, mc.y)
            return (
              <span
                key={p.userId}
                className="mk mk-player"
                style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
                title={`${p.name} · lv ${p.level} · ${mc.x}, ${mc.y}`}
              >
                <i />
                <b>{p.name}</b>
              </span>
            )
          })}
        </div>
      </div>
      <p className="map-note" style={{ marginTop: 8 }}>
        {players.length > 0
          ? `${players.length} player${players.length === 1 ? '' : 's'} online — markers update every 5s.`
          : 'No players online — join the server and watch yourself appear.'}
      </p>
    </>
  )
}
