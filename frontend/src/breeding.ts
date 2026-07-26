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
  const { species, combos } = data
  const n = species.length
  const idx = new Map(species.map((s, i) => [s, i]))
  const targetIdx = idx.get(target)
  if (targetIdx == null) return null

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

  if (cost[targetIdx] === Infinity) return null

  // Reconstruct into an ordered step list (parents before the step that
  // uses them); a shared intermediate needed twice is only bred once.
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

  return { target, steps, catches: [...catches] }
}
