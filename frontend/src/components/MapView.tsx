import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PalPlayer } from '../types'
import { api } from '../api'
import { loadPalData, mapCoord, mapToPct, pctToMapCoord, type PalGameData } from '../palData'
import { drawHeatmap } from '../heatmap'

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
  const [hover, setHover] = useState<{ left: number; top: number; clientX: number; clientY: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const heatRef = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ x: number; y: number; sl: number; st: number } | null>(null)
  const zoomRef = useRef(zoom)
  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])
  // Set by onWheel just before a zoom change, consumed by the layout effect
  // right after — keeps the map point under the cursor fixed instead of
  // zooming around whatever the scroll position happened to be.
  const zoomAnchor = useRef<{ cx: number; cy: number; contentX: number; contentY: number; oldZoom: number } | null>(
    null,
  )

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
    if (el && drag.current) {
      el.scrollLeft = drag.current.sl - (e.clientX - drag.current.x)
      el.scrollTop = drag.current.st - (e.clientY - drag.current.y)
    }
    const inner = innerRef.current
    if (!inner) return
    const rect = inner.getBoundingClientRect()
    const left = ((e.clientX - rect.left) / rect.width) * 100
    const top = ((e.clientY - rect.top) / rect.height) * 100
    if (left < 0 || left > 100 || top < 0 || top > 100) {
      setHover(null)
    } else {
      setHover({ left, top, clientX: e.clientX, clientY: e.clientY })
    }
  }
  const onPointerUp = () => (drag.current = null)
  const onPointerLeave = () => setHover(null)
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const el = wrapRef.current
    if (!el) return
    const oldZoom = zoomRef.current
    const newZoom = Math.min(8, Math.max(1, oldZoom + (e.deltaY < 0 ? 0.5 : -0.5)))
    if (newZoom === oldZoom) return
    const rect = el.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    zoomAnchor.current = { cx, cy, contentX: el.scrollLeft + cx, contentY: el.scrollTop + cy, oldZoom }
    setZoom(newZoom)
  }
  // Runs after .map-inner's width has updated for the new zoom, before paint
  // — rescales the anchored content point and re-centers it under the cursor.
  useLayoutEffect(() => {
    const el = wrapRef.current
    const a = zoomAnchor.current
    if (!el || !a) return
    zoomAnchor.current = null
    const scale = zoom / a.oldZoom
    el.scrollLeft = a.contentX * scale - a.cx
    el.scrollTop = a.contentY * scale - a.cy
  }, [zoom])

  // Density heatmap for the selected species' spawn points, in the app's
  // own accent color (whichever the user has picked in Settings) so it
  // never introduces a second hue on top of the existing dot markers.
  useEffect(() => {
    const canvas = heatRef.current
    if (!canvas) return
    if (!selected || selected.points.length === 0) {
      canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
      return
    }
    const size = Math.round(fit * zoom)
    const pxPoints = selected.points.map((s) => {
      const pos = mapToPct(s.x, s.y)
      return { x: (pos.left / 100) * size, y: (pos.top / 100) * size }
    })
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#e0447a'
    drawHeatmap(canvas, pxPoints, size, accent)
  }, [selected, fit, zoom])

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
        onPointerLeave={onPointerLeave}
        onWheel={onWheel}
      >
        <div className="map-inner" ref={innerRef} style={{ width: `${fit * zoom}px` }}>
          <img className="map-img" src="/game-data/map.jpg" alt="Palworld world map" draggable={false} />
          <canvas className="map-heat" ref={heatRef} />

          <span className="compass compass-n">N</span>
          <span className="compass compass-s">S</span>
          <span className="compass compass-w">W</span>
          <span className="compass compass-e">E</span>

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
                <small className="mk-player-coord mono">{mc.x}, {mc.y}</small>
              </span>
            )
          })}
        </div>
      </div>

      {hover &&
        (() => {
          const c = pctToMapCoord(hover.left, hover.top)
          return (
            <div
              className="map-hover-coord mono"
              style={{ left: hover.clientX + 14, top: hover.clientY + 14 }}
            >
              {c.x}, {c.y}
            </div>
          )
        })()}

      <p className="map-note" style={{ marginTop: 8 }}>
        {players.length > 0
          ? `${players.length} player${players.length === 1 ? '' : 's'} online — markers update every 5s.`
          : 'No players online — join the server and watch yourself appear.'}
      </p>
    </>
  )
}
