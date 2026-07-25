import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { Toggle } from './Toggle'

const IcGear = () => (
  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" /></svg>
)

// Spec 006 — the editable world settings form. Values are image env vars;
// empty = game default. Save persists; Apply & restart recreates the container
// (same world/ports) so the new env takes effect.
//
// Row layout + slider/toggle controls port palworld-gui's SettingsEditor
// (packages/web/src/SettingsEditor.tsx) — full-width label-left/control-right
// rows instead of a grid of small boxes, real range sliders for rate options,
// a pill toggle for booleans. min/max/step below are pulled directly from
// their shared options schema (packages/shared/src/options.ts) for the same
// underlying PalWorldSettings.ini keys — not guessed.

type Kind = 'num' | 'bool' | 'select' | 'text'
interface Opt {
  env: string
  label: string
  kind: Kind
  def: string
  choices?: string[]
  hint?: string
  min?: number
  max?: number
  step?: number
}
interface Cat {
  name: string
  opts: Opt[]
}

const CATS: Cat[] = [
  {
    name: 'Rates',
    opts: [
      { env: 'EXP_RATE', label: 'EXP rate', kind: 'num', def: '1', min: 0.1, max: 20, step: 0.1 },
      { env: 'PAL_CAPTURE_RATE', label: 'Capture rate', kind: 'num', def: '1', min: 0.5, max: 20, step: 0.1 },
      { env: 'PAL_SPAWN_NUM_RATE', label: 'Pal spawn amount', kind: 'num', def: '1', min: 0.5, max: 20, step: 0.1 },
      { env: 'WORK_SPEED_RATE', label: 'Work speed', kind: 'num', def: '1', min: 0.1, max: 20, step: 0.1 },
      { env: 'ENEMY_DROP_ITEM_RATE', label: 'Enemy item drops', kind: 'num', def: '1', min: 0.5, max: 20, step: 0.1 },
      { env: 'COLLECTION_DROP_RATE', label: 'Gathering drops', kind: 'num', def: '1', min: 0.5, max: 20, step: 0.1 },
      { env: 'COLLECTION_OBJECT_HP_RATE', label: 'Gatherable HP', kind: 'num', def: '1', min: 0.5, max: 20, step: 0.1 },
      { env: 'COLLECTION_OBJECT_RESPAWN_SPEED_RATE', label: 'Gatherable respawn', kind: 'num', def: '1', min: 0.5, max: 20, step: 0.1 },
    ],
  },
  {
    name: 'Day, night & eggs',
    opts: [
      { env: 'DAYTIME_SPEEDRATE', label: 'Day speed', kind: 'num', def: '1', min: 0.1, max: 20, step: 0.1 },
      { env: 'NIGHTTIME_SPEEDRATE', label: 'Night speed', kind: 'num', def: '1', min: 0.1, max: 20, step: 0.1 },
      { env: 'PAL_EGG_DEFAULT_HATCHING_TIME', label: 'Egg hatch time (h)', kind: 'num', def: '72', min: 0, max: 240, step: 1 },
    ],
  },
  {
    name: 'Combat',
    opts: [
      { env: 'PLAYER_DAMAGE_RATE_ATTACK', label: 'Player damage dealt', kind: 'num', def: '1', min: 0.1, max: 20, step: 0.1 },
      { env: 'PLAYER_DAMAGE_RATE_DEFENSE', label: 'Player damage taken', kind: 'num', def: '1', min: 0.1, max: 20, step: 0.1 },
      { env: 'PAL_DAMAGE_RATE_ATTACK', label: 'Pal damage dealt', kind: 'num', def: '1', min: 0.1, max: 20, step: 0.1 },
      { env: 'PAL_DAMAGE_RATE_DEFENSE', label: 'Pal damage taken', kind: 'num', def: '1', min: 0.1, max: 20, step: 0.1 },
      { env: 'ENABLE_PLAYER_TO_PLAYER_DAMAGE', label: 'Player-vs-player damage', kind: 'bool', def: 'False' },
      { env: 'ENABLE_FRIENDLY_FIRE', label: 'Friendly fire', kind: 'bool', def: 'False' },
      { env: 'ENABLE_INVADER_ENEMY', label: 'Base raids (invaders)', kind: 'bool', def: 'True' },
    ],
  },
  {
    name: 'Survival',
    opts: [
      { env: 'DEATH_PENALTY', label: 'Death penalty', kind: 'select', def: 'Item', choices: ['None', 'Item', 'ItemAndEquipment', 'All'] },
      { env: 'PLAYER_STOMACH_DECREASE_RATE', label: 'Player hunger drain', kind: 'num', def: '1', min: 0.1, max: 20, step: 0.1 },
      { env: 'PLAYER_STAMINA_DECREASE_RATE', label: 'Player stamina drain', kind: 'num', def: '1', min: 0.1, max: 20, step: 0.1 },
      { env: 'PLAYER_AUTO_HP_REGEN_RATE', label: 'Player HP regen', kind: 'num', def: '1', min: 0.1, max: 20, step: 0.1 },
      { env: 'PLAYER_AUTO_HP_REGEN_RATE_IN_SLEEP', label: 'Player sleep regen', kind: 'num', def: '1', min: 0.1, max: 20, step: 0.1 },
      { env: 'PAL_STOMACH_DECREASE_RATE', label: 'Pal hunger drain', kind: 'num', def: '1', min: 0.1, max: 20, step: 0.1 },
      { env: 'PAL_STAMINA_DECREASE_RATE', label: 'Pal stamina drain', kind: 'num', def: '1', min: 0.1, max: 20, step: 0.1 },
      { env: 'PAL_AUTO_HP_REGEN_RATE', label: 'Pal HP regen', kind: 'num', def: '1', min: 0.1, max: 20, step: 0.1 },
      { env: 'PAL_AUTO_HP_REGEN_RATE_IN_SLEEP', label: 'Pal sleep regen', kind: 'num', def: '1', min: 0.1, max: 20, step: 0.1 },
    ],
  },
  {
    name: 'Building & world',
    opts: [
      { env: 'BUILD_OBJECT_DAMAGE_RATE', label: 'Structure damage', kind: 'num', def: '1', min: 0.1, max: 20, step: 0.1 },
      { env: 'BUILD_OBJECT_DETERIORATION_DAMAGE_RATE', label: 'Structure decay', kind: 'num', def: '1', min: 0, max: 20, step: 0.1 },
      { env: 'BASE_CAMP_MAX_NUM', label: 'Max base camps (world)', kind: 'num', def: '128', min: 1, max: 1024, step: 1 },
      { env: 'BASE_CAMP_WORKER_MAX_NUM', label: 'Max workers per base', kind: 'num', def: '15', min: 1, max: 50, step: 1 },
      { env: 'DROP_ITEM_MAX_NUM', label: 'Max dropped items', kind: 'num', def: '3000', min: 0, max: 5000, step: 1 },
      { env: 'DROP_ITEM_ALIVE_MAX_HOURS', label: 'Dropped item lifetime (h)', kind: 'num', def: '1', min: 0, max: 24, step: 0.5 },
    ],
  },
  {
    name: 'Guild & misc',
    opts: [
      { env: 'GUILD_PLAYER_MAX_NUM', label: 'Max guild members', kind: 'num', def: '20', min: 1, max: 100, step: 1 },
      { env: 'AUTO_RESET_GUILD_NO_ONLINE_PLAYERS', label: 'Auto-reset inactive guilds', kind: 'bool', def: 'False' },
      { env: 'AUTO_RESET_GUILD_TIME_NO_ONLINE_PLAYERS', label: 'Guild reset after (h)', kind: 'num', def: '72', min: 1, max: 168, step: 1 },
      { env: 'CAN_PICKUP_OTHER_GUILD_DEATH_PENALTY_DROP', label: 'Loot other guilds’ drops', kind: 'bool', def: 'False' },
      { env: 'ENABLE_NON_LOGIN_PENALTY', label: 'Non-login penalty', kind: 'bool', def: 'True' },
      { env: 'ENABLE_FAST_TRAVEL', label: 'Fast travel', kind: 'bool', def: 'True' },
      { env: 'IS_START_LOCATION_SELECT_BY_MAP', label: 'Choose start location', kind: 'bool', def: 'False' },
      { env: 'EXIST_PLAYER_AFTER_LOGOUT', label: 'Body stays after logout', kind: 'bool', def: 'False' },
    ],
  },
  {
    name: 'Network',
    opts: [
      { env: 'TZ', label: 'Timezone', kind: 'text', def: '(image default)', hint: 'e.g. America/Chicago' },
      { env: 'MULTITHREADING', label: 'Multithreading', kind: 'bool', def: 'False', hint: 'Better performance on multi-core hosts' },
      { env: 'COMMUNITY', label: 'Public server browser', kind: 'bool', def: 'False', hint: "List this server in Palworld's in-game community list" },
      { env: 'PUBLIC_IP', label: 'Public IP', kind: 'text', def: '(none)', hint: 'Only needed if this server is reachable from the internet — the public port always matches the game port' },
    ],
  },
]

function OptRow({ o, value, onChange }: { o: Opt; value: string; onChange: (v: string) => void }) {
  const numVal = Math.min(Math.max(Number(value || o.def), o.min ?? -Infinity), o.max ?? Infinity)
  return (
    <div className="opt-row" title={o.env}>
      <div className="opt-info">
        <p className="opt-name">{o.label}</p>
        <p className="opt-key">{o.env} · default {o.def}</p>
        {o.hint && <p className="opt-hint">{o.hint}</p>}
      </div>
      <div className="opt-ctl">
        {o.kind === 'bool' ? (
          <Toggle checked={(value || o.def) === 'True'} onChange={(v) => onChange(v ? 'True' : 'False')} />
        ) : o.kind === 'select' ? (
          <select value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">default ({o.def})</option>
            {o.choices!.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        ) : o.kind === 'text' ? (
          <input
            className="opt-text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={o.def}
          />
        ) : (
          <>
            {o.min !== undefined && o.max !== undefined && (
              <input
                type="range"
                className="opt-range"
                min={o.min}
                max={o.max}
                step={o.step ?? 1}
                value={numVal}
                onChange={(e) => onChange(e.target.value)}
              />
            )}
            <input
              className="opt-num"
              inputMode="decimal"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={o.def}
            />
          </>
        )}
      </div>
    </div>
  )
}

export function WorldSettingsPanel({
  id,
  running,
  onApplied,
}: {
  id: string
  running: boolean
  onApplied: () => void
}) {
  const [desc, setDesc] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(16)
  const [difficulty, setDifficulty] = useState('None')
  const [pvp, setPvp] = useState(false)
  const [password, setPassword] = useState<string | null>(null) // null = keep
  const [hasPassword, setHasPassword] = useState(false)
  const [world, setWorld] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<string>('') // snapshot for dirty check
  const [busy, setBusy] = useState<'save' | 'apply' | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let live = true
    api
      .getSettings(id)
      .then((s) => {
        if (!live) return
        setDesc(s.description)
        setMaxPlayers(s.maxPlayers)
        setDifficulty(s.difficulty)
        setPvp(s.pvp)
        setHasPassword(s.hasPassword)
        setPassword(null)
        setWorld(s.worldSettings ?? {})
        setSaved(JSON.stringify([s.description, s.maxPlayers, s.difficulty, s.pvp, s.worldSettings ?? {}]))
        setLoaded(true)
      })
      .catch((e) => live && setErr((e as Error).message))
    return () => {
      live = false
    }
  }, [id])

  const dirty = useMemo(
    () =>
      loaded &&
      (JSON.stringify([desc, maxPlayers, difficulty, pvp, world]) !== saved || password !== null),
    [loaded, desc, maxPlayers, difficulty, pvp, world, saved, password],
  )

  const setOpt = (env: string, v: string) =>
    setWorld((w) => {
      const next = { ...w }
      if (v === '') delete next[env]
      else next[env] = v
      return next
    })

  const save = async (): Promise<boolean> => {
    setBusy('save')
    setErr(null)
    setNote(null)
    try {
      await api.putSettings(id, {
        description: desc,
        maxPlayers,
        difficulty,
        pvp,
        ...(password !== null ? { serverPassword: password } : {}),
        worldSettings: world,
      })
      setSaved(JSON.stringify([desc, maxPlayers, difficulty, pvp, world]))
      if (password !== null) setHasPassword(password !== '')
      setPassword(null)
      setNote('Saved. Apply & restart to take effect.')
      return true
    } catch (e) {
      setErr((e as Error).message)
      return false
    } finally {
      setBusy(null)
    }
  }

  const apply = async () => {
    if (
      !confirm(
        running
          ? 'Apply settings now? The server saves, restarts with the new settings, and is briefly offline.'
          : 'Apply settings? The container is recreated (world kept); the server stays stopped.',
      )
    )
      return
    if (!(await save())) return
    setBusy('apply')
    setNote(null)
    try {
      const r = await api.recreate(id)
      setNote(
        r.wasRunning
          ? 'Applied — server restarting with the new settings.'
          : 'Applied — start the server when ready.',
      )
      onApplied()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  if (!loaded && !err)
    return (
      <div className="skeleton-row">
        <div className="skeleton-bar" style={{ width: '40%' }} />
        <div className="skeleton-bar" style={{ width: '85%' }} />
        <div className="skeleton-bar" style={{ width: '70%' }} />
        <div className="skeleton-bar" style={{ width: '55%' }} />
      </div>
    )

  return (
    <div className="wsform">
      <div className="tab-intro">
        <span className="tab-intro-ic"><IcGear /></span>
        <div>
          <h3>World settings</h3>
          <p>Edit the server's rules, then Save and Apply &amp; restart when you're ready — Save alone just stages the change.</p>
        </div>
      </div>

      <div className="formcard">
        <div className="formcard-head"><b>General</b></div>
        <div className="opt-list">
          <div className="opt-row">
            <div className="opt-info">
              <p className="opt-name">Description</p>
              <p className="opt-key">Shown in the in-game server browser</p>
            </div>
            <div className="opt-ctl">
              <input className="opt-text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="none" />
            </div>
          </div>
          <div className="opt-row">
            <div className="opt-info">
              <p className="opt-name">Max players</p>
              <p className="opt-key">ServerPlayerMaxNum · default 32</p>
            </div>
            <div className="opt-ctl">
              <input
                type="range"
                className="opt-range"
                min={1}
                max={99}
                step={1}
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(Number(e.target.value))}
              />
              <input
                className="opt-num"
                type="number"
                min={1}
                max={99}
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="opt-row">
            <div className="opt-info">
              <p className="opt-name">Difficulty</p>
            </div>
            <div className="opt-ctl">
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                {['None', 'Normal', 'Difficult'].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="opt-row">
            <div className="opt-info">
              <p className="opt-name">Join password</p>
              <p className="opt-key">{hasPassword ? 'currently set' : 'currently none'}</p>
            </div>
            <div className="opt-ctl">
              <input
                className="opt-text"
                value={password ?? ''}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={hasPassword ? '•••••• (type to change, clear to remove)' : 'none — type to set'}
              />
            </div>
          </div>
          <div className="opt-row">
            <div className="opt-info">
              <p className="opt-name">PvP mode</p>
              <p className="opt-key">Player-vs-player damage on the world map</p>
            </div>
            <div className="opt-ctl">
              <Toggle checked={pvp} onChange={setPvp} />
            </div>
          </div>
        </div>
      </div>

      {CATS.map((cat) => (
        <div className="formcard" key={cat.name}>
          <div className="formcard-head"><b>{cat.name}</b></div>
          <div className="opt-list">
            {cat.opts.map((o) => (
              <OptRow key={o.env} o={o} value={world[o.env] ?? ''} onChange={(v) => setOpt(o.env, v)} />
            ))}
          </div>
        </div>
      ))}

      {err && <p className="form-err">{err}</p>}
      {note && <p className="note">{note}</p>}

      <div className="set-actions">
        {dirty && <span className="note">unsaved changes</span>}
        <button onClick={save} disabled={busy !== null || !dirty}>
          {busy === 'save' ? 'Saving…' : 'Save'}
        </button>
        <button className="solid" onClick={apply} disabled={busy !== null}>
          {busy === 'apply' ? 'Applying…' : 'Apply & restart'}
        </button>
      </div>
    </div>
  )
}
