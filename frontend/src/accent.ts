// The accent color is a runtime choice, not a build-time one — Jon kept
// wanting to try different hues, so instead of redeploying each time, it's a
// picker in Settings backed by two CSS custom properties + localStorage.
export interface AccentPreset {
  id: string
  name: string
  acc: string
  accStrong: string
}

export const ACCENTS: AccentPreset[] = [
  { id: 'rose', name: 'Rose', acc: '#e0447a', accStrong: '#ef6b98' },
  { id: 'teal', name: 'Teal', acc: '#22b8a0', accStrong: '#3ecfb6' },
  { id: 'cobalt', name: 'Cobalt', acc: '#3b82f6', accStrong: '#63a1ff' },
  { id: 'amber', name: 'Amber', acc: '#d9822b', accStrong: '#eb9c4e' },
  { id: 'indigo', name: 'Indigo', acc: '#7c7ff2', accStrong: '#9a9cf7' },
]

const KEY = 'paldeck.accent'
const DEFAULT_ID = 'rose'

export function getSavedAccentId(): string {
  try {
    const id = localStorage.getItem(KEY)
    return ACCENTS.some((a) => a.id === id) ? id! : DEFAULT_ID
  } catch {
    return DEFAULT_ID
  }
}

export function applyAccent(id: string) {
  const preset = ACCENTS.find((a) => a.id === id) ?? ACCENTS[0]
  document.documentElement.style.setProperty('--acc', preset.acc)
  document.documentElement.style.setProperty('--acc-strong', preset.accStrong)
  try {
    localStorage.setItem(KEY, preset.id)
  } catch {
    /* private browsing etc — the choice just won't persist across reloads */
  }
}
