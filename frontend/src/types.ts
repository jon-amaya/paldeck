// Mirrors store.Server's JSON shape from the Go backend. Keep in sync with
// internal/store/store.go. Passwords are json:"-" server-side, so they never
// appear here.
export interface Server {
  id: string
  name: string
  containerId: string
  gamePort: number
  queryPort: number
  rconPort: number
  description: string
  maxPlayers: number
  difficulty: string
  pvp: boolean
  createdAt: string
  status: string // running | exited | created | restarting | absent | …
}

export type LifecycleAction = 'start' | 'stop' | 'restart'

export type PendingAction = LifecycleAction | 'delete'

// While an action is in flight the status shows what's happening — important
// because a graceful Stop can take up to ~90s while Palworld saves.
export const PENDING_LABEL: Record<PendingAction, string> = {
  start: 'starting…',
  stop: 'stopping…',
  restart: 'restarting…',
  delete: 'deleting…',
}

// POST /api/servers responds with the server *plus* the admin password — the
// only time the backend ever reveals it.
export interface CreatedServer extends Server {
  adminPassword: string
}

// GET /api/servers/{id}/metrics — every field beyond status is optional:
// docker-derived ones need the container running; palworld-derived ones also
// need a REST port (restAvailable) and a booted server.
export interface ServerMetrics {
  status: string
  restAvailable: boolean
  uptimeSec?: number
  cpuPercent?: number
  memUsed?: number
  memLimit?: number
  players?: number
  maxPlayers?: number
  fps?: number
  day?: number
  version?: string
}

// One entry of GET /api/servers/{id}/pals — parsed from the world save.
export interface Pal {
  instanceId: string
  species: string
  nickName: string
  level: number
  gender: string
  isPlayer: boolean
  talentHp: number
  talentMelee: number
  talentShot: number
  talentDefense: number
  passives: string[]
  ownerUid: string
  ownerName: string
  exp: number
  rank: number
  rankHp: number
  rankAttack: number
  rankDefense: number
  rankCraftSpeed: number
  isLucky: boolean
  friendship: number
  movesEquipped: string[]
  movesMastered: string[]
}

// One entry of GET /api/servers/{id}/backups — the image's own hourly
// world snapshots (timestamp is the folder name, the backup's identity).
export interface Backup {
  worldId: string
  timestamp: string // "2026.07.20-09.35.28"
  sizeBytes: number
  modTime: string
}

// One entry of GET /api/servers/{id}/players.
export interface PalPlayer {
  name: string
  playerId: string
  userId: string
  ip: string
  ping: number
  location_x: number
  location_y: number
  level: number
}

// What the New Server form sends to POST /api/servers. Optional fields are
// omitted when blank; the backend fills defaults (admin password auto-generates,
// players → 16, difficulty → None).
export interface CreateServerInput {
  name: string
  description?: string
  maxPlayers?: number
  serverPassword?: string
  adminPassword?: string
  difficulty?: string
  pvp?: boolean
  worldSettings?: Record<string, string>
  // Each independently 0/omitted = auto-assign from the pool; set any to pin an exact port.
  gamePort?: number
  queryPort?: number
  rconPort?: number
  restApiPort?: number
}
