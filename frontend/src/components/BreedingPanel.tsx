import { useEffect, useMemo, useState } from 'react'
import type { Pal } from '../types'
import { api } from '../api'
import { loadPalData, speciesKey, type PalGameData } from '../palData'
import { loadBreedingData, computeBreedingPlan, type BreedingData, type BreedingPlan } from '../breeding'

// Species chip: icon + display name, used for both parents and the child in
// each breeding step — same visual language as PalsPanel's pal-cell. Marks
// parents you already own so the path is legible at a glance: which of the
// two chips in a "A x B -> C" row you can breed right now versus still need.
function Species({ id, gd, owned }: { id: string; gd: PalGameData; owned?: boolean }) {
  const info = gd.species.get(id)
  return (
    <span className="pal-cell">
      {info && <img className="pal-ic" src={`/game-data/pals/${info.icon}`} alt="" />}
      {info?.name ?? id}
      {owned && <span className="chip-inline chip-owned">have it</span>}
    </span>
  )
}

// Given a target species, shows every known way to get it: a wild/boss catch
// location if one exists, AND its breeding recipe if one exists — a species
// having wild spawns doesn't mean breeding isn't the better option, so both
// show rather than the calculator silently picking one for you.
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
    for (const key of gd.bossSpawns.keys()) s.add(key)
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

  // Discriminated result — 'owned' and 'no-path' both mean "nothing to show"
  // but for different reasons, so they can't share one null sentinel.
  // 'options' can hold a catch plan, a breed plan, or both at once.
  type Result =
    | { kind: 'owned' }
    | { kind: 'no-path' }
    | { kind: 'options'; catchPlan: BreedingPlan | null; breedPlan: BreedingPlan | null }
  const result: Result | undefined = useMemo(() => {
    if (!target || !bd) return undefined
    if (owned.has(target.key)) return { kind: 'owned' }

    // The direct-catch route: only exists if the target itself is catchable.
    const catchPlan = catchable.has(target.key)
      ? computeBreedingPlan(bd, target.key, owned, catchable)
      : null

    // The breeding route: recompute with the target excluded from the
    // catchable set, so "it's also catchable in the wild" can't shortcut
    // the search into skipping breeding entirely — this is the only way to
    // learn the actual recipe even for species you could also just go catch.
    const catchableNoTarget = new Set(catchable)
    catchableNoTarget.delete(target.key)
    const breedPlanRaw = computeBreedingPlan(bd, target.key, owned, catchableNoTarget)
    const breedPlan = breedPlanRaw && breedPlanRaw.steps.length > 0 ? breedPlanRaw : null

    if (!catchPlan && !breedPlan) return { kind: 'no-path' }
    return { kind: 'options', catchPlan, breedPlan }
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
          <p>Search any species above — Paldeck checks what's already in the world, its wild/boss spawn locations, and its breeding recipe.</p>
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
          <p>{target.name} has no wild spawns, no known boss encounter, and no known breeding combo produces it in this dataset.</p>
        </div>
      )}

      {target && result?.kind === 'options' && (
        <>
          {result.catchPlan && <CatchDirectly plan={result.catchPlan} gd={gd} target={target.name} />}
          {result.breedPlan && (
            <BreedSteps
              plan={result.breedPlan}
              gd={gd}
              target={target.name}
              owned={owned}
              heading={result.catchPlan ? 'Or breed it' : undefined}
            />
          )}
        </>
      )}
    </>
  )
}

// Wild spawns first; falls back to boss/field-boss encounters for species
// with no regular wild spawn (Jetragon and other boss-only pals).
type SpawnPoint = { x: number; y: number; label?: string }
function catchLocationsOf(gd: PalGameData, id: string): SpawnPoint[] {
  const wild = gd.spawns.get(id) ?? []
  if (wild.length > 0) return wild
  return (gd.bossSpawns.get(id) ?? []).map((b) => ({ x: b.x, y: b.y, label: `boss · lvl ${b.lv}` }))
}

function LocationChips({ points }: { points: SpawnPoint[] }) {
  return (
    <div className="souls">
      {points.slice(0, 12).map((p, i) => (
        <span key={i} className="spawn-chip mono">
          {p.label ? `${p.label} · ` : ''}({p.x}, {p.y})
        </span>
      ))}
      {points.length > 12 && <span className="mut" style={{ fontSize: 12 }}>+{points.length - 12} more</span>}
    </div>
  )
}

function CatchDirectly({ plan, gd, target }: { plan: BreedingPlan; gd: PalGameData; target: string }) {
  const points = catchLocationsOf(gd, plan.target)
  const isBoss = gd.spawns.get(plan.target)?.length === 0 || !gd.spawns.has(plan.target)
  return (
    <div className="placeholder" style={{ marginBottom: 16 }}>
      <b>Catch it directly</b>
      <p style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Species id={plan.target} gd={gd} /> {isBoss ? 'is a boss encounter' : `spawns in the wild — no need to breed a ${target}`}
      </p>
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center' }}>
        <LocationChips points={points} />
      </div>
    </div>
  )
}

function BreedSteps({
  plan,
  gd,
  target,
  owned,
  heading,
}: {
  plan: BreedingPlan
  gd: PalGameData
  target: string
  owned: Set<string>
  heading?: string
}) {
  const catchLocations = (spid: string) => catchLocationsOf(gd, spid)

  return (
    <>
      {heading && <div className="pd-label">{heading}</div>}
      <p className="map-note" style={{ marginBottom: 10, marginTop: heading ? 8 : 0 }}>
        {plan.steps.length} breeding step{plan.steps.length === 1 ? '' : 's'} to {target}
        {plan.catches.length > 0
          ? ` · ${plan.catches.length} pal${plan.catches.length === 1 ? '' : 's'} to catch first`
          : ' · you already have everything this needs'}
      </p>

      <div className="wsform">
        {plan.steps.map((step, i) => {
          // A step's child becomes available for the *next* step once bred
          // here, so it counts as "have it" for anything downstream even
          // before this plan is actually carried out.
          const producedSoFar = plan.steps.slice(0, i).map((s) => s.child)
          const has = (sid: string) => owned.has(sid) || producedSoFar.includes(sid)
          return (
            <div className="formcard" key={i}>
              <div className="formcard-head">
                <b>Step {i + 1}</b>
              </div>
              <div className="field-row" style={{ alignItems: 'center' }}>
                <Species id={step.a} gd={gd} owned={has(step.a)} />
                <span className="mut">×</span>
                <Species id={step.b} gd={gd} owned={has(step.b)} />
                <span className="mut">→</span>
                <Species id={step.child} gd={gd} />
              </div>
            </div>
          )
        })}
      </div>

      {plan.catches.length > 0 && (
        <>
          <div className="pd-label" style={{ marginTop: 20 }}>Catch these first</div>
          <div className="wsform">
            {plan.catches.map((spid) => {
              const points = catchLocations(spid)
              return (
                <div className="formcard" key={spid}>
                  <div className="formcard-head">
                    <Species id={spid} gd={gd} />
                  </div>
                  {points.length === 0 ? (
                    <p className="note">No known wild spawn or boss encounter — check the in-game map or an event.</p>
                  ) : (
                    <LocationChips points={points} />
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
