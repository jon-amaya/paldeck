// Species-level breeding path solver.
//
// breeding.json is a precomputed combo table sourced from PalCalc
// (github.com/tylercamp/palcalc), which datamines it directly from
// Palworld's game files, via github.com/beckerfelipee/PalworldBreedingCalculator
// (MIT licensed). Not a formula: real breeding math isn't a simple average
// of the two parents' power, so a formula gets a large fraction of pairs
// wrong — this uses the game's actual, mined results instead. Ids are
// lowercased to match speciesKey()'s convention elsewhere in the app.
// Three species (Ribunny, Ribunny Botan, Gumoss (Special)) have no match in
// Paldeck's own pals.json and are absent from the table.

export interface BreedingData {
  species: string[] // paldeck species ids, index-aligned with combos
  combos: (string | null)[][] // combos[i][j] = child id from breeding species[i] x species[j]
}

let cached: Promise<BreedingData> | null = null
export function loadBreedingData(): Promise<BreedingData> {
  if (!cached) cached = fetch('/game-data/breeding.json').then((r) => r.json())
  return cached
}

export interface BreedStep {
  a: string
  b: string
  child: string
}

export interface BreedingPlan {
  target: string
  steps: BreedStep[] // ordered so each step's parents are already available
  catches: string[] // species you don't currently own that the plan needs — go catch these
}

// One valid way to breed `target`: a specific parent pair, plus (for
// whichever parent isn't already owned or catchable) the plan to obtain it.
// A species can have dozens or hundreds of valid pairs — this is one of
// them, not necessarily involving the cheapest sub-plans on both sides
// individually, but the pair itself is real breeding-table data either way.
export interface ParentOption {
  a: string
  b: string
  aPlan: BreedingPlan | null // null = a is already owned or catchable, no breeding needed
  bPlan: BreedingPlan | null
  totalSteps: number // aPlan's steps + bPlan's steps + 1 for this pair's own cross
}

// The solved graph: for every species, the fewest-steps way to obtain it
// (cost), and which two species combine to produce it that way (parentA/B,
// -1 for a leaf). Expensive part of the algorithm — computed once and
// reused for reconstructing as many different species' plans as needed,
// since redoing this per-parent for a target with hundreds of valid pairs
// (Anubis has 467) would multiply the cost hundreds of times over.
interface Solved {
  species: string[]
  idx: Map<string, number>
  cost: number[]
  parentA: number[]
  parentB: number[]
}

function solve(data: BreedingData, owned: Set<string>, catchable: Set<string>): Solved {
  const { species, combos } = data
  const n = species.length
  const idx = new Map(species.map((s, i) => [s, i]))

  const cost = new Array<number>(n).fill(Infinity)
  const newCatchCount = new Array<number>(n).fill(Infinity)
  const parentA = new Array<number>(n).fill(-1)
  const parentB = new Array<number>(n).fill(-1)

  for (let i = 0; i < n; i++) {
    const sid = species[i]
    if (owned.has(sid) || catchable.has(sid)) {
      cost[i] = 0
      newCatchCount[i] = owned.has(sid) ? 0 : 1
    }
  }

  // For each species, which (otherIdx, childIdx) pairs it participates in —
  // built once so the relaxation below doesn't rescan the full matrix.
  const pairsOf: { other: number; child: number }[][] = Array.from({ length: n }, () => [])
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const c = combos[i][j]
      if (!c) continue
      const ci = idx.get(c)
      if (ci == null) continue
      pairsOf[i].push({ other: j, child: ci })
      if (j !== i) pairsOf[j].push({ other: i, child: ci })
    }
  }

  // AND-OR shortest path via iterative relaxation — small graph (a few
  // hundred species), converges in a handful of passes in practice.
  let changed = true
  let guard = 0
  while (changed && guard++ < n) {
    changed = false
    for (let i = 0; i < n; i++) {
      if (cost[i] === Infinity) continue
      for (const { other, child } of pairsOf[i]) {
        if (cost[other] === Infinity) continue
        const c = cost[i] + cost[other] + 1
        const nc = newCatchCount[i] + newCatchCount[other]
        if (c < cost[child] || (c === cost[child] && nc < newCatchCount[child])) {
          cost[child] = c
          newCatchCount[child] = nc
          parentA[child] = i
          parentB[child] = other
          changed = true
        }
      }
    }
  }

  return { species, idx, cost, parentA, parentB }
}

// Reconstructs the fewest-steps plan for one species from an already-solved
// graph — ordered so each step's parents are already available; a shared
// intermediate needed twice is only bred once.
function reconstruct(solved: Solved, targetIdx: number, owned: Set<string>): BreedingPlan | null {
  if (solved.cost[targetIdx] === Infinity) return null
  const { species, parentA, parentB } = solved
  const steps: BreedStep[] = []
  const have = new Set<string>(owned)
  const catches = new Set<string>()

  const visit = (i: number) => {
    const sid = species[i]
    if (have.has(sid)) return
    if (parentA[i] === -1) {
      have.add(sid)
      catches.add(sid)
      return
    }
    visit(parentA[i])
    visit(parentB[i])
    steps.push({ a: species[parentA[i]], b: species[parentB[i]], child: sid })
    have.add(sid)
  }
  visit(targetIdx)

  return { target: species[targetIdx], steps, catches: [...catches] }
}

// Fewest-breeding-steps way to obtain `target`. Owned species are free
// (zero-step) parents; catchable species (have wild spawns) are also free
// to use as parents but get listed under `catches` since you don't have one
// yet. Ties are broken toward plans that reuse more of what you already
// own, so it never suggests catching something you don't need to.
export function computeBreedingPlan(
  data: BreedingData,
  target: string,
  owned: Set<string>,
  catchable: Set<string>,
): BreedingPlan | null {
  const solved = solve(data, owned, catchable)
  const targetIdx = solved.idx.get(target)
  if (targetIdx == null) return null
  return reconstruct(solved, targetIdx, owned)
}

// Every valid parent pair for `target` in the breeding table (not just the
// single cheapest one) — community breeding calculators show this, and a
// specific pair might be preferable for reasons the step-count alone
// doesn't capture (a favorite pal, a passive you're farming for). Each
// option carries the plan needed for whichever parent isn't already owned
// or catchable, so "how many steps to reach the parents themselves" is
// answered per-option, not just for the one plan computeBreedingPlan picks.
// Sorted fewest-total-steps first.
export function computeAllParentOptions(
  data: BreedingData,
  target: string,
  owned: Set<string>,
  catchable: Set<string>,
): ParentOption[] {
  const solved = solve(data, owned, catchable)
  const targetIdx = solved.idx.get(target)
  if (targetIdx == null) return []

  const planFor = (i: number): BreedingPlan | null => {
    const sid = solved.species[i]
    if (owned.has(sid) || catchable.has(sid)) return null
    return reconstruct(solved, i, owned)
  }

  const options: ParentOption[] = []
  for (let i = 0; i < solved.species.length; i++) {
    for (let j = i; j < solved.species.length; j++) {
      if (data.combos[i][j] !== target) continue
      if (i === targetIdx && j === targetIdx) continue // self x self — not a real breeding option
      const aPlan = planFor(i)
      const bPlan = planFor(j)
      const totalSteps = (aPlan?.steps.length ?? 0) + (bPlan?.steps.length ?? 0) + 1
      options.push({ a: solved.species[i], b: solved.species[j], aPlan, bPlan, totalSteps })
    }
  }
  options.sort((x, y) => x.totalSteps - y.totalSteps)
  return options
}
