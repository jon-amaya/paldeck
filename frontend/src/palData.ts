// Static Palworld game data served from /game-data (embedded in the binary):
// species names + icons, passive-trait names/ranks, and wild spawn points in
// in-game map coordinates. Loaded once, cached for the session.

export interface SpeciesInfo {
  id: string
  name: string
  icon: string
}
export interface PassiveInfo {
  id: string
  name: string
  rank: number
}
export interface SkillInfo {
  id: string
  name: string
  element: string
}
export interface Landmark {
  type: 'Dungeon' | 'Fast Travel' | 'Tower'
  x: number
  y: number
  name: { en: string }
}
export interface Boss {
  name: { en: string }
  x: number
  y: number
  lv: number
  icon: string
}
export interface PalGameData {
  species: Map<string, SpeciesInfo>
  passives: Map<string, PassiveInfo>
  spawns: Map<string, { x: number; y: number }[]>
  skills: Map<string, SkillInfo>
  landmarks: Landmark[]
  bosses: Boss[]
}

let cached: Promise<PalGameData> | null = null

export function loadPalData(): Promise<PalGameData> {
  if (!cached) {
    cached = (async () => {
      const [sp, pv, sw, sk, lm, bs] = await Promise.all([
        fetch('/game-data/pals.json').then((r) => r.json()),
        fetch('/game-data/passives.json').then((r) => r.json()),
        fetch('/game-data/pal-spawns.json').then((r) => r.json()),
        fetch('/game-data/activeSkills.json').then((r) => r.json()),
        fetch('/game-data/landmarks.json').then((r) => r.json()),
        fetch('/game-data/bosses.json').then((r) => r.json()),
      ])
      const species = new Map<string, SpeciesInfo>()
      for (const s of sp as SpeciesInfo[]) species.set(s.id.toLowerCase(), s)
      const passives = new Map<string, PassiveInfo>()
      for (const p of pv as PassiveInfo[]) passives.set(p.id.toLowerCase(), p)
      const spawns = new Map<string, { x: number; y: number }[]>(
        Object.entries(sw as Record<string, { x: number; y: number }[]>).map(([k, v]) => [
          k.toLowerCase(),
          v,
        ]),
      )
      const skills = new Map<string, SkillInfo>()
      for (const s of sk as SkillInfo[]) skills.set(s.id.toLowerCase(), s)
      return {
        species,
        passives,
        spawns,
        skills,
        landmarks: lm as Landmark[],
        bosses: bs as Boss[],
      }
    })()
  }
  return cached
}

// World units → in-game map coordinates. Axes swapped, game rounds; offsets
// fitted from two standing-player calibration pairs (specs/003 plan.md).
export const mapCoord = (worldX: number, worldY: number) => ({
  x: Math.round((worldY - 157829) / 459.317),
  y: Math.round((worldX + 123490) / 459.317),
})

// The world-map image (/game-data/map.jpg) covers this map-coordinate square
// (bounds documented against the wiki's DataMaps; verified in the fork's map).
export const MAP_BOUNDS = { minX: -1922.44, maxX: 1233.99, minY: -2125.3, maxY: 1031.13 }

// Map coords → percentage position on the map image (top-left origin).
// The stored image is rotated 90° CCW in CSS (.map-img) to match the game's
// presentation, but that transform only repaints pixels — it doesn't rotate
// the coordinate space markers are placed in (left/top %, relative to the
// unrotated .map-inner box). A 90° rotation needs both an axis swap *and* a
// mirror on one axis; only the swap was applied here before, which put every
// marker in the wrong spot. For content at fractional position (fx, fy) in
// the source image, a -90° (CCW) rotation places it on screen at (fy, 1-fx).
export const mapToPct = (x: number, y: number) => {
  const fx = (x - MAP_BOUNDS.minX) / (MAP_BOUNDS.maxX - MAP_BOUNDS.minX)
  const fy = (y - MAP_BOUNDS.minY) / (MAP_BOUNDS.maxY - MAP_BOUNDS.minY)
  return {
    left: fy * 100,
    top: (1 - fx) * 100,
  }
}

// Save CharacterIDs carry variant prefixes: BOSS_ = alpha, etc.
export function speciesKey(characterId: string): { key: string; alpha: boolean } {
  let id = characterId
  let alpha = false
  const up = id.toUpperCase()
  for (const pre of ['BOSS_', 'PREDATOR_', 'RAID_', 'GYM_']) {
    if (up.startsWith(pre)) {
      id = id.slice(pre.length)
      alpha = true
      break
    }
  }
  return { key: id.toLowerCase(), alpha }
}
