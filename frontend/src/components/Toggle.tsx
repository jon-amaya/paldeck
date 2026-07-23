// Shared pill switch — same shape as shadcn/Radix's Switch (track + sliding
// thumb), used anywhere a boolean setting needs a control nicer than a
// checkbox (World Settings option rows, the New Server PvP field).
export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`opt-toggle ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <i />
    </button>
  )
}
