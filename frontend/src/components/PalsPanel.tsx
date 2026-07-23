import { useEffect, useMemo, useState } from 'react'
import type { Pal } from '../types'
import { api } from '../api'
import { loadPalData, speciesKey, type PalGameData } from '../palData'

type SortKey =
  | 'level'
  | 'talentHp'
  | 'talentMelee'
  | 'talentShot'
  | 'talentDefense'
  | 'ivTotal'
  | 'species'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'level', label: 'Level' },
  { key: 'ivTotal', label: 'IV total' },
  { key: 'talentHp', label: 'HP IV' },
  { key: 'talentMelee', label: 'Melee IV' },
  { key: 'talentShot', label: 'Ranged IV' },
  { key: 'talentDefense', label: 'Defense IV' },
  { key: 'species', label: 'Species' },
]

function sortVal(p: Pal, k: SortKey): number | string {
  if (k === 'ivTotal') return p.talentHp + p.talentMelee + p.talentShot + p.talentDefense
  if (k === 'species') return p.species
  return p[k]
}

// Every captured Pal in the world, parsed straight out of Level.sav —
// enriched with species names, icons, trait ranks, and wild spawn points.
export function PalsPanel({ id }: { id: string }) {
  const [pals, setPals] = useState<Pal[] | null>(null)
  const [gd, setGd] = useState<PalGameData | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('level')
  const [desc, setDesc] = useState(true)
  const [showPlayers, setShowPlayers] = useState(false)
  const [sel, setSel] = useState<Pal | null>(null)

  useEffect(() => {
    let live = true
    setPals(null)
    setErr(null)
    api
      .pals(id)
      .then((r) => live && setPals(r.pals))
      .catch((e) => live && setErr((e as Error).message))
    loadPalData().then((d) => live && setGd(d))
    return () => {
      live = false
    }
  }, [id])

  const display = (p: Pal) => {
    const { key, alpha } = speciesKey(p.species)
    const info = gd?.species.get(key)
    return {
      name: info?.name ?? p.species ?? '—',
      icon: info ? `/game-data/pals/${info.icon}` : null,
      alpha,
      spawns: gd?.spawns.get(key) ?? [],
    }
  }

  const rows = useMemo(() => {
    if (!pals) return []
    const needle = q.trim().toLowerCase()
    let out = pals.filter((p) => showPlayers || !p.isPlayer)
    if (needle && gd) {
      out = out.filter((p) => {
        const info = gd.species.get(speciesKey(p.species).key)
        return (
          p.species.toLowerCase().includes(needle) ||
          (info?.name.toLowerCase().includes(needle) ?? false) ||
          p.nickName.toLowerCase().includes(needle) ||
          p.ownerName.toLowerCase().includes(needle)
        )
      })
    }
    out = [...out].sort((a, b) => {
      const av = sortVal(a, sortKey)
      const bv = sortVal(b, sortKey)
      const cmp =
        typeof av === 'string' && typeof bv === 'string'
          ? av.localeCompare(bv)
          : (av as number) - (bv as number)
      return desc ? -cmp : cmp
    })
    return out
  }, [pals, gd, q, sortKey, desc, showPlayers])

  if (err)
    return (
      <div className="placeholder">
        <b>Couldn't read the world save</b>
        <p>{err}</p>
      </div>
    )
  if (!pals)
    return (
      <>
        <p className="note" style={{ marginBottom: 12 }}>
          Reading world save — decompressing and parsing Level.sav, a second or two.
        </p>
        <div className="skeleton-row">
          <div className="skeleton-bar" style={{ width: '95%' }} />
          <div className="skeleton-bar" style={{ width: '88%' }} />
          <div className="skeleton-bar" style={{ width: '92%' }} />
          <div className="skeleton-bar" style={{ width: '80%' }} />
          <div className="skeleton-bar" style={{ width: '90%' }} />
        </div>
      </>
    )

  return (
    <>
      <div className="pals-bar">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search species, nickname, owner…"
        />
        <label className="sortsel">
          <span>Sort by</span>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => setDesc((d) => !d)} title="Flip sort direction">
          {desc ? '↓' : '↑'}
        </button>
        <label className="toggle">
          <input
            type="checkbox"
            checked={showPlayers}
            onChange={(e) => setShowPlayers(e.target.checked)}
          />
          <span>players</span>
        </label>
        <span className="pals-count">
          {rows.length} of {pals.filter((p) => showPlayers || !p.isPlayer).length}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="placeholder">
          <b>No matches</b>
          <p>No Pals match that search.</p>
        </div>
      ) : (
        <div className="stable-wrap">
          <table className="stable">
            <thead>
              <tr>
                <th>Pal</th>
                <th>Nickname</th>
                <th>Lv</th>
                <th>Gender</th>
                <th>HP</th>
                <th>ATK-M</th>
                <th>ATK-R</th>
                <th>DEF</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const d = display(p)
                return (
                  <tr key={p.instanceId} className="pal-row" onClick={() => setSel(p)}>
                    <td className="nm">
                      <span className="pal-cell">
                        {d.icon && (
                          <img
                            className="pal-ic"
                            src={d.icon}
                            alt=""
                            loading="lazy"
                            onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                          />
                        )}
                        {d.name}
                        {p.isLucky && <span title="Lucky pal">✨</span>}
                        {p.rank > 1 && <span className="chip-inline chip-alpha">★{p.rank - 1}</span>}
                        {d.alpha && <span className="chip-inline chip-alpha">alpha</span>}
                        {p.isPlayer && <span className="chip-inline">player</span>}
                      </span>
                    </td>
                    <td>{p.nickName || <span className="mut">—</span>}</td>
                    <td className="mono">{p.level}</td>
                    <td className="mut">{p.gender || '—'}</td>
                    <td className="mono">{p.talentHp}</td>
                    <td className="mono">{p.talentMelee}</td>
                    <td className="mono">{p.talentShot}</td>
                    <td className="mono">{p.talentDefense}</td>
                    <td className="mut">
                      {p.ownerName || (p.ownerUid ? p.ownerUid.slice(0, 8) : 'wild')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {sel && gd && (
        <PalDetail p={sel} gd={gd} onClose={() => setSel(null)} />
      )}
    </>
  )
}

function PalDetail({ p, gd, onClose }: { p: Pal; gd: PalGameData; onClose: () => void }) {
  const { key, alpha } = speciesKey(p.species)
  const info = gd.species.get(key)
  const spawns = gd.spawns.get(key) ?? []
  const ivs: { label: string; v: number }[] = [
    { label: 'HP', v: p.talentHp },
    { label: 'Melee', v: p.talentMelee },
    { label: 'Ranged', v: p.talentShot },
    { label: 'Defense', v: p.talentDefense },
  ]
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2 className="pal-cell">
            {info && (
              <img className="pal-ic pal-ic-lg" src={`/game-data/pals/${info.icon}`} alt="" />
            )}
            {info?.name ?? p.species}
            {p.isLucky && <span title="Lucky pal">✨</span>}
            {alpha && <span className="chip-inline chip-alpha">alpha</span>}
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="form">
          <div className="modal-note">
            {p.nickName ? `“${p.nickName}” · ` : ''}Level {p.level} · {p.gender || '?'} ·
            {p.rank > 1 ? ` ${'★'.repeat(p.rank - 1)} condensed · ` : ' '}
            Exp {p.exp.toLocaleString()} · Trust {p.friendship.toLocaleString()} ·
            owned by {p.ownerName || 'unknown'}
          </div>

          {(p.rankHp > 0 || p.rankAttack > 0 || p.rankDefense > 0 || p.rankCraftSpeed > 0) && (
            <div>
              <div className="pd-label">Soul enhancements</div>
              <div className="souls">
                <span className="spawn-chip">HP +{p.rankHp}</span>
                <span className="spawn-chip">ATK +{p.rankAttack}</span>
                <span className="spawn-chip">DEF +{p.rankDefense}</span>
                <span className="spawn-chip">Work +{p.rankCraftSpeed}</span>
              </div>
            </div>
          )}

          <div>
            <div className="pd-label">Talents (IVs)</div>
            {ivs.map((iv) => (
              <div className="iv-row" key={iv.label}>
                <span className="iv-name">{iv.label}</span>
                <span className="iv-bar"><i style={{ width: `${iv.v}%` }} /></span>
                <span className="mono iv-val">{iv.v}</span>
              </div>
            ))}
          </div>

          <div>
            <div className="pd-label">Traits</div>
            {p.passives.length === 0 ? (
              <div className="modal-note">No passive traits.</div>
            ) : (
              p.passives.map((id) => {
                const t = gd.passives.get(id.toLowerCase())
                return (
                  <div key={id} className="pd-passive">
                    <span>{t?.name ?? id}</span>
                    {t && (
                      <span className={`pd-rank ${t.rank >= 0 ? 'up' : 'down'}`}>
                        {t.rank >= 0 ? '+' : ''}{t.rank}
                      </span>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {p.movesEquipped.length > 0 && (
            <div>
              <div className="pd-label">Moves</div>
              <div className="souls">
                {p.movesEquipped.map((id) => {
                  const sk = gd.skills.get(id.toLowerCase())
                  return (
                    <span key={id} className={`spawn-chip el-${(sk?.element ?? '').toLowerCase()}`}>
                      {sk?.name ?? id}
                    </span>
                  )
                })}
              </div>
              {p.movesMastered.length > p.movesEquipped.length && (
                <div className="modal-note" style={{ marginTop: 5 }}>
                  knows {p.movesMastered.length} moves total
                </div>
              )}
            </div>
          )}

          <div>
            <div className="pd-label">Where to find ({spawns.length} wild spawn points)</div>
            {spawns.length === 0 ? (
              <div className="modal-note">
                No known wild spawns — obtained from eggs, breeding, or dungeons.
              </div>
            ) : (
              <div className="spawn-list">
                {spawns.slice(0, 14).map((s, i) => (
                  <span key={i} className="spawn-chip mono">
                    {s.x}, {s.y}
                  </span>
                ))}
                {spawns.length > 14 && (
                  <span className="modal-note">+{spawns.length - 14} more</span>
                )}
              </div>
            )}
            <div className="modal-note" style={{ marginTop: 6 }}>
              Coordinates are in-game map coords — pin these on the Map tab when it lands.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
