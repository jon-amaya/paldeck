// Typed wrappers over the Go REST API. All paths are same-origin (/api/*) —
// Vite proxies them to :8080 in dev; the embedded SPA hits the same server in
// prod. On a non-2xx we throw the backend's {"error": "..."} message.
import type { Server, LifecycleAction, CreateServerInput, CreatedServer } from './types'

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
}
