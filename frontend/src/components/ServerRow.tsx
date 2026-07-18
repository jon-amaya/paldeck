import type { Server, LifecycleAction, PendingAction } from '../types'
import { PENDING_LABEL } from '../types'

// One row of the servers table: status, players (live count lands with spec
// 003), ports, quick Start/Stop, and Manage → the tabbed detail view.
export function ServerRow({
  s,
  pending,
  onAction,
  onOpen,
}: {
  s: Server
  pending?: PendingAction
  onAction: (id: string, a: LifecycleAction) => void
  onOpen: (id: string) => void
}) {
  const running = s.status === 'running'
  const busy = pending !== undefined

  return (
    <tr>
      <td className="nm">{s.name}</td>
      <td>
        <span className={`st ${pending ? 'pend' : running ? 'run' : ''}`}>
          <i />
          {pending ? PENDING_LABEL[pending] : s.status}
        </span>
      </td>
      <td className="mut">
        — / {s.maxPlayers}
        {s.pvp ? ' · PvP' : ''}
      </td>
      <td className="mono mut">
        {s.gamePort} · {s.queryPort} · {s.rconPort}
      </td>
      <td>
        {running ? (
          <button onClick={() => onAction(s.id, 'stop')} disabled={busy}>
            {pending === 'stop' ? <span className="spin" aria-hidden="true" /> : '■'} Stop
          </button>
        ) : (
          <button onClick={() => onAction(s.id, 'start')} disabled={busy}>
            {pending === 'start' ? <span className="spin" aria-hidden="true" /> : '▶'} Start
          </button>
        )}{' '}
        <button onClick={() => onOpen(s.id)}>Manage</button>
      </td>
    </tr>
  )
}
