import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev server config. The proxy is the key bit: while we develop against Vite on
// :5173, any request to /api (REST *and* the /logs WebSocket, thanks to ws:true)
// is forwarded to the Go backend on :8080. So the frontend never hardcodes a
// backend URL — same-origin in dev via proxy, same-origin in prod via embed.
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
