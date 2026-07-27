import { useEffect, useMemo, useState } from 'react'
import type { Pal, Server } from '../types'
import { api } from '../api'
import { loadPalData, speciesKey, type PalGameData } from '../palData'
import {
  loadBreedingData,
  computeBreedingPlan,
  computeAllParentOptions,
  type BreedingData,
  type BreedingPlan,
} from '../breeding'

type SpawnPoint = { x: number; y: number; label?: string }
// Wild spawns first; falls back to boss/field-boss encounters for species
// with no regular wild spawn (Jetragon and other boss-only pals).
function catchLocationsOf(gd: PalGameData, id: string): SpawnPoint[] {
  const wild = gd.spawns.get(id) ?? []
  if (wild.length > 0) return wild
  return (gd.bossSpawns.get(id) ?? []).map((b) => ({ x: b.x, y: b.y, label: `boss · lvl ${b.lv}` }))
}

function LocationChips({ points }: { points: SpawnPoint[] }) {
  return (
    <div className="souls">
      {points.slice(0, 8).map((p, i) => (
        <span key={i} className="spawn-chip mono">
          {p.label ? `${p.label} · ` : ''}({p.x}, {p.y})
        </span>
      ))}
      {points.length > 8 && <span className="mut" style={{ fontSize: 11 }}>+{points.length - 8} more</span>}
    </div>
  )
}

// One pal slot in a breeding row: icon (ring color carries status) + name +
// tag. `result` renders slightly larger, matching the approved wireframe.
function BPal({ id, gd, status, result }: { id: string; gd: PalGameData; status?: 'owned' | 'catch'; result?: boolean }) {
  const info = gd.species.get(id)
  return (
    <div className={`bpal${result ? ' bresult' : ''}`}>
      <div className="bic-wrap">
        <div className={`bic${status ? ' ' + status : ''}${result ? ' result' : ''}`}>
          {info && <img src={`/game-data/pals/${info.icon}`} alt="" />}
        </div>
        {status && <span className={`bic-badge ${status}`}>{status === 'owned' ? '✓' : '!'}</span>}
      </div>
      <span className="bname">{info?.name ?? id}</span>
      {status === 'owned' && <span className="btag owned">have it</span>}
      {status === 'catch' && <span className="btag catch">catch</span>}
    </div>
  )
}

// A catchable-but-unowned parent can sometimes also be bred from what's
// already on hand — collapsed by default so the primary path stays a clean
// numbered line, expandable per-row rather than shown for everything at
// once (that's what made the previous version confusing).
function BreedInstead({
  id,
  gd,
  bd,
  owned,
  catchable,
}: {
  id: string
  gd: PalGameData
  bd: BreedingData
  owned: Set<string>
  catchable: Set<string>
}) {
  const [open, setOpen] = useState(false)
  const catchableWithoutSelf = useMemo(() => {
    const s = new Set(catchable)
    s.delete(id)
    return s
  }, [catchable, id])
  const opts = useMemo(
    () => computeAllParentOptions(bd, id, owned, catchableWithoutSelf),
    [bd, id, owned, catchableWithoutSelf],
  )
  if (opts.length === 0) return null
  const best = opts[0]
  const statusOf = (sid: string) => (owned.has(sid) ? 'owned' : catchableWithoutSelf.has(sid) ? 'catch' : undefined)

  return (
    <div className="balt-box">
      <button className="balt-toggle" onClick={() => setOpen((o) => !o)}>
        {open
          ? 'hide'
          : `or breed it — ${opts.length} way${opts.length === 1 ? '' : 's'}, cheapest ${best.totalSteps} step${best.totalSteps === 1 ? '' : 's'} ›`}
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          <div className="bstep" style={{ background: 'var(--panel)', marginBottom: 6 }}>
            <BPal id={best.a} gd={gd} status={statusOf(best.a)} />
            <span className="bx">×</span>
            <BPal id={best.b} gd={gd} status={statusOf(best.b)} />
            <span className="beq">=</span>
            <BPal id={id} gd={gd} result />
          </div>
          {best.aPlan && (
            <p className="note" style={{ fontSize: 11.5, marginBottom: 3 }}>
              {gd.species.get(best.a)?.name ?? best.a} needs {best.aPlan.steps.length} more step{best.aPlan.steps.length === 1 ? '' : 's'} of its own.
            </p>
          )}
          {best.bPlan && (
            <p className="note" style={{ fontSize: 11.5 }}>
              {gd.species.get(best.b)?.name ?? best.b} needs {best.bPlan.steps.length} more step{best.bPlan.steps.length === 1 ? '' : 's'} of its own.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// The primary numbered path: one row per breeding step, top to bottom in
// the order you'd actually do them. Each row's result reappears as a plain
// parent in the next row once it exists — same pal, not a new fact.
function FastestPath({
  plan,
  gd,
  bd,
  owned,
  catchable,
}: {
  plan: BreedingPlan
  gd: PalGameData
  bd: BreedingData
  owned: Set<string>
  catchable: Set<string>
}) {
  return (
    <>
      {plan.steps.map((step, i) => {
        const producedSoFar = plan.steps.slice(0, i).map((s) => s.child)
        const statusOf = (sid: string): 'owned' | 'catch' | undefined => {
          if (owned.has(sid) || producedSoFar.includes(sid)) return owned.has(sid) ? 'owned' : undefined
          if (catchable.has(sid)) return 'catch'
          return undefined
        }
        const isResult = i === plan.steps.length - 1
        return (
          <div key={i}>
            <div className="bstep">
              <span className="bstepnum">{i + 1}</span>
              <BPal id={step.a} gd={gd} status={statusOf(step.a)} />
              <span className="bx">×</span>
              <BPal id={step.b} gd={gd} status={statusOf(step.b)} />
              <span className="beq">=</span>
              <BPal id={step.child} gd={gd} result={isResult} />
              {statusOf(step.a) === 'catch' && (
                <div className="balt-box">
                  <LocationChips points={catchLocationsOf(gd, step.a)} />
                  <BreedInstead id={step.a} gd={gd} bd={bd} owned={owned} catchable={catchable} />
                </div>
              )}
              {statusOf(step.b) === 'catch' && (
                <div className="balt-box">
                  <LocationChips points={catchLocationsOf(gd, step.b)} />
                  <BreedInstead id={step.b} gd={gd} bd={bd} owned={owned} catchable={catchable} />
                </div>
              )}
            </div>
          </div>
        )
      })}
      <div className="breach">
        <span>✓</span> Target reached
      </div>
    </>
  )
}

function CatchDirectly({ id, gd, target }: { id: string; gd: PalGameData; target: string }) {
  const points = catchLocationsOf(gd, id)
  const isBoss = gd.spawns.get(id)?.length === 0 || !gd.spawns.has(id)
  return (
    <div className="placeholder" style={{ marginBottom: 16 }}>
      <b>Catch it directly</b>
      <p>{target} {isBoss ? 'is a boss encounter' : 'spawns in the wild'} — no breeding needed.</p>
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center' }}>
        <LocationChips points={points} />
      </div>
    </div>
  )
}

const DEFAULT_SHOWN = 15

// Given a target species, shows the single fastest way to get it as a
// numbered chain — one pal's face per parent, top to bottom in breeding
// order — plus every other known parent combination collapsed below.
// Checks pals owned against whichever server is picked at the top, not
// necessarily the server this tab happens to be open under.
export function BreedingPanel({ id }: { id: string }) {
  const [servers, setServers] = useState<Server[]>([])
  const [checkId, setCheckId] = useState(id)
  const [pals, setPals] = useState<Pal[] | null>(null)
  const [gd, setGd] = useState<PalGameData | null>(null)
  const [bd, setBd] = useState<BreedingData | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [targetQ, setTargetQ] = useState('')
  const [showAllAlt, setShowAllAlt] = useState(false)

  useEffect(() => {
    api.list().then(setServers).catch(() => {})
    loadPalData().then(setGd)
    loadBreedingData().then(setBd)
  }, [])

  useEffect(() => {
    let live = true
    setPals(null)
    setErr(null)
    api.pals(checkId).then((r) => live && setPals(r.pals)).catch((e) => live && setErr((e as Error).message))
    return () => {
      live = false
    }
  }, [checkId])

  useEffect(() => setShowAllAlt(false), [targetQ, checkId])

  const owned = useMemo(() => {
    const s = new Set<string>()
    if (!pals) return s
    for (const p of pals) if (!p.isPlayer) s.add(speciesKey(p.species).key)
    return s
  }, [pals])

  const catchable = useMemo(() => {
    const s = new Set<string>()
    if (!gd) return s
    for (const [key, points] of gd.spawns) if (points.length > 0) s.add(key)
    for (const key of gd.bossSpawns.keys()) s.add(key)
    return s
  }, [gd])

  const options = useMemo(() => {
    if (!gd || !bd) return []
    const ids = new Set([...bd.species, ...catchable])
    const out: { key: string; name: string }[] = []
    for (const key of ids) {
      const info = gd.species.get(key)
      if (info) out.push({ key, name: info.name })
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }, [gd, bd, catchable])

  const target = useMemo(() => {
    if (!targetQ.trim()) return null
    const needle = targetQ.trim().toLowerCase()
    return (
      options.find((o) => o.name.toLowerCase() === needle) ??
      options.find((o) => o.name.toLowerCase().startsWith(needle))
    )
  }, [options, targetQ])

  // catchId and plan are computed independently — a target being catchable
  // never hides its breeding options, same as any leaf parent further down
  // a chain (BreedInstead). Regressed once already when the panel was
  // rewritten around the numbered-chain layout; kept explicit this time.
  type Result =
    | { kind: 'owned' }
    | { kind: 'no-path' }
    | { kind: 'found'; catchId: string | null; plan: BreedingPlan | null; altCount: number }
  const result: Result | undefined = useMemo(() => {
    if (!target || !bd) return undefined
    if (owned.has(target.key)) return { kind: 'owned' }

    const catchId = catchable.has(target.key) ? target.key : null

    // Excluded from catchable so a catchable target can't shortcut the
    // breeding search into finding nothing.
    const catchableNoTarget = new Set(catchable)
    catchableNoTarget.delete(target.key)
    const plan = computeBreedingPlan(bd, target.key, owned, catchableNoTarget)
    const altCount = plan ? computeAllParentOptions(bd, target.key, owned, catchableNoTarget).length : 0

    if (!catchId && !plan) return { kind: 'no-path' }
    return { kind: 'found', catchId, plan, altCount }
  }, [target, bd, owned, catchable])

  const allOptions = useMemo(() => {
    if (!bd || !target || result?.kind !== 'found' || !result.plan) return []
    const catchableNoTarget = new Set(catchable)
    catchableNoTarget.delete(target.key)
    return computeAllParentOptions(bd, target.key, owned, catchableNoTarget)
  }, [bd, target, result, owned, catchable])

  if (err) return <div className="placeholder"><b>Couldn't load pals</b><p>{err}</p></div>

  return (
    <>
      <div className="map-bar" style={{ flexWrap: 'wrap' }}>
        {servers.length > 1 && (
          <select value={checkId} onChange={(e) => setCheckId(e.target.value)} style={{ maxWidth: 220 }}>
            {servers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
        <input
          list="breed-species"
          value={targetQ}
          onChange={(e) => setTargetQ(e.target.value)}
          placeholder="Breed toward… (e.g. Jetragon)"
        />
        <datalist id="breed-species">
          {options.map((o) => (
            <option key={o.key} value={o.name} />
          ))}
        </datalist>
      </div>

      {!pals && !err && <div className="placeholder"><b>Breeding</b><p>loading…</p></div>}

      {pals && !target && (
        <div className="placeholder">
          <b>Pick a target</b>
          <p>Search any species above — Paldeck checks what's owned on the selected server, its wild/boss spawn locations, and every known breeding recipe.</p>
        </div>
      )}

      {pals && gd && bd && target && result?.kind === 'owned' && (
        <div className="placeholder">
          <b>Already got one</b>
          <p>A {target.name} is already somewhere in this world.</p>
        </div>
      )}

      {pals && gd && bd && target && result?.kind === 'no-path' && (
        <div className="placeholder">
          <b>No known path</b>
          <p>{target.name} has no wild spawns, no known boss encounter, and no known breeding combo produces it in this dataset.</p>
        </div>
      )}

      {pals && gd && bd && target && result?.kind === 'found' && result.catchId && (
        <CatchDirectly id={result.catchId} gd={gd} target={target.name} />
      )}

      {pals && gd && bd && target && result?.kind === 'found' && result.plan && (
        <>
          <div className="headline-row" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <b>{result.catchId ? 'Or breed it' : `Fastest path to ${target.name}`}</b>
            <span className="mut" style={{ fontSize: 12.5 }}>
              {result.plan.steps.length} step{result.plan.steps.length === 1 ? '' : 's'}
              {result.plan.catches.length > 0 && ` · ${result.plan.catches.length} to catch`}
            </span>
          </div>

          <FastestPath plan={result.plan} gd={gd} bd={bd} owned={owned} catchable={catchable} />

          {result.altCount > 1 && (
            <button
              className="alt-toggle"
              style={{
                width: '100%', marginTop: 14, background: 'var(--panel2)', border: '1px solid var(--line)',
                borderRadius: 10, padding: '11px 14px', color: 'var(--mut)', fontSize: 13.5,
                display: 'flex', justifyContent: 'space-between', cursor: 'pointer',
              }}
              onClick={() => setShowAllAlt((v) => !v)}
            >
              <span><b style={{ color: 'var(--ink)' }}>{result.altCount}</b> known parent combinations for {target.name}</span>
              <span>{showAllAlt ? 'hide ‹' : 'show all ›'}</span>
            </button>
          )}

          {showAllAlt && (
            <div style={{ marginTop: 12 }}>
              {allOptions.slice(0, DEFAULT_SHOWN * 2).map((opt, i) => {
                const statusOf = (sid: string) => (owned.has(sid) ? 'owned' : catchable.has(sid) ? 'catch' : undefined)
                return (
                  <div className="bstep" key={`${opt.a}-${opt.b}-${i}`}>
                    <BPal id={opt.a} gd={gd} status={statusOf(opt.a)} />
                    <span className="bx">×</span>
                    <BPal id={opt.b} gd={gd} status={statusOf(opt.b)} />
                    <span className="beq">=</span>
                    <BPal id={target.key} gd={gd} result />
                    <span className="mut" style={{ fontSize: 11.5, marginLeft: 'auto' }}>{opt.totalSteps} step{opt.totalSteps === 1 ? '' : 's'} total</span>
                  </div>
                )
              })}
              {allOptions.length > DEFAULT_SHOWN * 2 && (
                <p className="note">+{allOptions.length - DEFAULT_SHOWN * 2} more, sorted cheapest first — narrow the search if you need a specific one.</p>
              )}
            </div>
          )}
        </>
      )}
    </>
  )
}
