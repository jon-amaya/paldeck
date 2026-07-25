// Typed wrappers over the Go REST API. All paths are same-origin (/api/*) —
// Vite proxies them to :8080 in dev; the embedded SPA hits the same server in
// prod. On a non-2xx we throw the backend's {"error": "..."} message.
import type {
  Server,
  LifecycleAction,
  CreateServerInput,
  CreatedServer,
  ServerMetrics,
  PalPlayer,
  Pal,
  Backup,
  ImportCandidate,
} from './types'

async function unwrap<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const body = await r.json().catch(() => ({ error: r.statusText }))
    throw new Error(body.error || r.statusText)
  }
  // 204 No Content (delete) has no body to parse.
  return r.status === 204 ? (undefined as T) : (r.json() as Promise<T>)
}

export const api = {
  list: () => fetch('/api/servers').then((r) => unwrap<Server[]>(r)),

  create: (input: CreateServerInput) =>
    fetch('/api/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then((r) => unwrap<CreatedServer>(r)),

  action: (id: string, a: LifecycleAction) =>
    fetch(`/api/servers/${id}/${a}`, { method: 'POST' }).then((r) =>
      unwrap<{ status: string }>(r),
    ),

  remove: (id: string) =>
    fetch(`/api/servers/${id}`, { method: 'DELETE' }).then((r) =>
      unwrap<void>(r),
    ),

  metrics: (id: string) =>
    fetch(`/api/servers/${id}/metrics`).then((r) => unwrap<ServerMetrics>(r)),

  players: (id: string) =>
    fetch(`/api/servers/${id}/players`).then((r) =>
      unwrap<{ available: boolean; players: PalPlayer[] }>(r),
    ),

  broadcast: (id: string, message: string) =>
    fetch(`/api/servers/${id}/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    }).then((r) => unwrap<{ status: string }>(r)),

  pals: (id: string) =>
    fetch(`/api/servers/${id}/pals`).then((r) =>
      unwrap<{ pals: Pal[]; cachedAt: string }>(r),
    ),

  backups: (id: string) =>
    fetch(`/api/servers/${id}/backups`).then((r) =>
      unwrap<{ backups: Backup[] }>(r),
    ),

  restoreBackup: (id: string, ts: string) =>
    fetch(`/api/servers/${id}/backups/${encodeURIComponent(ts)}/restore`, {
      method: 'POST',
    }).then((r) => unwrap<{ status: string }>(r)),

  rconExec: (id: string, command: string) =>
    fetch(`/api/servers/${id}/rcon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    }).then((r) => unwrap<{ output: string }>(r)),

  getSettings: (id: string) =>
    fetch(`/api/servers/${id}/settings`).then((r) =>
      unwrap<{
        description: string
        maxPlayers: number
        difficulty: string
        pvp: boolean
        hasPassword: boolean
        worldSettings: Record<string, string>
      }>(r),
    ),

  putSettings: (
    id: string,
    body: {
      description?: string
      maxPlayers?: number
      serverPassword?: string
      difficulty?: string
      pvp?: boolean
      worldSettings?: Record<string, string>
    },
  ) =>
    fetch(`/api/servers/${id}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => unwrap<{ status: string }>(r)),

  recreate: (id: string) =>
    fetch(`/api/servers/${id}/recreate`, { method: 'POST' }).then((r) =>
      unwrap<{ status: string; wasRunning: boolean }>(r),
    ),

  playerAction: (id: string, uid: string, kind: 'kick' | 'ban') =>
    fetch(`/api/servers/${id}/players/${uid}/${kind}`, { method: 'POST' }).then(
      (r) => unwrap<{ status: string }>(r),
    ),

  importCandidates: () =>
    fetch('/api/import-candidates').then((r) =>
      unwrap<{ candidates: ImportCandidate[] }>(r),
    ),

  importSave: (id: string, sourceContainerId: string) =>
    fetch(`/api/servers/${id}/import-save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceContainerId }),
    }).then((r) => unwrap<{ status: string }>(r)),
}
