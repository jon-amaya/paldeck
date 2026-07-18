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
}
