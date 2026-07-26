import { useEffect, useMemo, useState } from 'react'
import type { Pal } from '../types'
import { api } from '../api'
import { loadPalData, speciesKey, type PalGameData } from '../palData'
import { loadBreedingData, computeBreedingPlan, type BreedingData, type BreedingPlan } from '../breeding'

// Species chip: icon + display name, used for both parents and the child in
// each breeding step — same visual language as PalsPanel's pal-cell.
function Species({ id, gd }: { id: string; gd: PalGameData }) {
  const info = gd.species.get(id)
  return (
    <span className="pal-cell">
      {info && <img className="pal-ic" src={`/game-data/pals/${info.icon}`} alt="" />}
      {info?.name ?? id}
    </span>
  )
}

// Given a target species, works out the fewest-breeding-steps way to get
// it from what's currently in the world, using PalCalc's datamined combo
// table (see breeding.ts). Anything the plan needs that you don't already
// own gets listed with its wild spawn locations.
export function BreedingPanel({ id }: { id: string }) {
  const [pals, setPals] = useState<Pal[] | null>(null)
  const [gd, setGd] = useState<PalGameData | null>(null)
  const [bd, setBd] = useState<BreedingData | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [targetQ, setTargetQ] = useState('')

  useEffect(() => {
    let live = true
    api.pals(id).then((r) => live && setPals(r.pals)).catch((e) => live && setErr((e as Error).message))
    loadPalData().then((d) => live && setGd(d))
    loadBreedingData().then((d) => live && setBd(d))
    return () => {
      live = false
    }
  }, [id])

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
    return s
  }, [gd])

  // breedable species — anything either directly breedable-into or catchable
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

  // Discriminated result — 'owned' and 'no-path' both mean "no plan to
  // show" but for different reasons, so they can't share the null sentinel.
  type Result = { kind: 'owned' } | { kind: 'no-path' } | { kind: 'plan'; plan: BreedingPlan }
  const result: Result | undefined = useMemo(() => {
    if (!target || !bd) return undefined
    if (owned.has(target.key)) return { kind: 'owned' }
    const plan = computeBreedingPlan(bd, target.key, owned, catchable)
    return plan ? { kind: 'plan', plan } : { kind: 'no-path' }
  }, [target, bd, owned, catchable])

  if (err) return <div className="placeholder"><b>Couldn't load pals</b><p>{err}</p></div>
  if (!pals || !gd || !bd) return <div className="placeholder"><b>Breeding</b><p>loading…</p></div>

  return (
    <>
      <div className="map-bar">
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

      {!target && (
        <div className="placeholder">
          <b>Pick a target</b>
          <p>Search any species above — Paldeck checks what's already in the world and works out the shortest breeding path to it.</p>
        </div>
      )}

      {target && result?.kind === 'owned' && (
        <div className="placeholder">
          <b>Already got one</b>
          <p>A {target.name} is already somewhere in this world.</p>
        </div>
      )}

      {target && result?.kind === 'no-path' && (
        <div className="placeholder">
          <b>No known path</b>
          <p>{target.name} has no wild spawns and no known breeding combo produces it in this dataset.</p>
        </div>
      )}

      {target && result?.kind === 'plan' && (
        <BreedingResult plan={result.plan} gd={gd} target={target.name} />
      )}
    </>
  )
}

function BreedingResult({ plan, gd, target }: { plan: BreedingPlan; gd: PalGameData; target: string }) {
  const catchLocations = (id: string) => gd.spawns.get(id) ?? []

  if (plan.steps.length === 0 && plan.catches.length === 1 && plan.catches[0] === plan.target) {
    return (
      <div className="placeholder">
        <b>No breeding needed</b>
        <p>{target} spawns in the wild — catch it directly.</p>
        <div className="souls" style={{ justifyContent: 'center', marginTop: 10 }}>
          {catchLocations(plan.target).slice(0, 12).map((p, i) => (
            <span key={i} className="spawn-chip mono">{p.x}, {p.y}</span>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <p className="map-note" style={{ marginBottom: 10 }}>
        {plan.steps.length} breeding step{plan.steps.length === 1 ? '' : 's'} to {target}
        {plan.catches.length > 0 &&
          ` · ${plan.catches.length} pal${plan.catches.length === 1 ? '' : 's'} to catch first`}
      </p>

      <div className="wsform">
        {plan.steps.map((step, i) => (
          <div className="formcard" key={i}>
            <div className="formcard-head">
              <b>Step {i + 1}</b>
            </div>
            <div className="field-row" style={{ alignItems: 'center' }}>
              <Species id={step.a} gd={gd} />
              <span className="mut">×</span>
              <Species id={step.b} gd={gd} />
              <span className="mut">→</span>
              <Species id={step.child} gd={gd} />
            </div>
          </div>
        ))}
      </div>

      {plan.catches.length > 0 && (
        <>
          <div className="pd-label" style={{ marginTop: 20 }}>Catch these first</div>
          <div className="wsform">
            {plan.catches.map((id) => {
              const points = catchLocations(id)
              return (
                <div className="formcard" key={id}>
                  <div className="formcard-head">
                    <Species id={id} gd={gd} />
                  </div>
                  {points.length === 0 ? (
                    <p className="note">No known wild spawn — check the in-game map or an event.</p>
                  ) : (
                    <div className="souls">
                      {points.slice(0, 12).map((p, i) => (
                        <span key={i} className="spawn-chip mono">{p.x}, {p.y}</span>
                      ))}
                      {points.length > 12 && (
                        <span className="mut" style={{ fontSize: 12 }}>+{points.length - 12} more</span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
