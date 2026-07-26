// Density heatmap for "where does this species spawn" on the world map.
// Single-hue sequential ramp — light tint at low density, the theme accent
// itself (dark/saturated) at peak — built from whichever accent the user has
// picked (Settings → Appearance), never a second hue for "hotter".

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.trim().replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t)

function buildRamp(accentHex: string): [number, number, number][] {
  const [r, g, b] = hexToRgb(accentHex)
  const light: [number, number, number] = [mix(r, 255, 0.82), mix(g, 255, 0.82), mix(b, 255, 0.82)]
  const dark: [number, number, number] = [mix(r, 0, 0.55), mix(g, 0, 0.55), mix(b, 0, 0.55)]
  const ramp: [number, number, number][] = []
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    ramp.push([mix(light[0], dark[0], t), mix(light[1], dark[1], t), mix(light[2], dark[2], t)])
  }
  return ramp
}

// points are in canvas pixel space already (caller converts from map %).
export function drawHeatmap(
  canvas: HTMLCanvasElement,
  points: { x: number; y: number }[],
  size: number,
  accentHex: string,
) {
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, size, size)
  if (points.length === 0) return

  // Denser species get smaller blobs so hundreds of spawns don't merge into
  // one blob covering the whole map; sparse species get bigger, visible ones.
  const radius = Math.max(18, Math.min(40, 900 / Math.sqrt(points.length)))

  for (const p of points) {
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius)
    grad.addColorStop(0, 'rgba(0,0,0,0.22)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  const img = ctx.getImageData(0, 0, size, size)
  const data = img.data
  let maxA = 1
  for (let i = 3; i < data.length; i += 4) if (data[i] > maxA) maxA = data[i]

  const ramp = buildRamp(accentHex)
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    if (a === 0) continue
    const t = Math.min(255, Math.round((a / maxA) * 255))
    const [r, g, b] = ramp[t]
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = Math.min(255, Math.round((a / maxA) * 210) + 25)
  }
  ctx.putImageData(img, 0, 0)
}
