import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/dm-sans'
import '@fontsource-variable/outfit'
import '@fontsource-variable/cascadia-code'
import './index.css'
import App from './App.tsx'
import { applyAccent, getSavedAccentId } from './accent.ts'

// Applied before the first paint so there's no flash of the default accent.
applyAccent(getSavedAccentId())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
