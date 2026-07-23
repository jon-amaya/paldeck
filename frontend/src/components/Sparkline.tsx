import { useMemo, useState } from 'react'

// A quiet single-series trend line for a stat tile. The number next to it is
// always the primary value — this is supplementary, not the only carrier of
// the data (dataviz skill: single series needs no legend, one hue, thin 2px
// line, rounded ends, hover shown).
export function Sparkline({
  data,
  width = 120,
  height = 32,
  color = 'var(--acc)',
  formatValue = (v: number) => String(Math.round(v)),
}: {
  data: number[]
  width?: number
  height?: number
  color?: string
  formatValue?: (v: number) => string
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const pts = useMemo(() => {
    if (data.length < 2) return []
    const min = Math.min(...data)
    const max = Math.max(...data)
    const span = max - min || 1
    const stepX = width / (data.length - 1)
    return data.map((v, i): [number, number] => [
      i * stepX,
      height - ((v - min) / span) * (height - 4) - 2,
    ])
  }, [data, width, height])

  if (pts.length < 2) {
    return <div className="spark-empty" style={{ width, height }} />
  }

  const stepX = width / (pts.length - 1)
  const pointsAttr = pts.map(([x, y]) => `${x},${y}`).join(' ')
  const idx = hoverIdx ?? pts.length - 1
  const [hx, hy] = pts[idx]

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const relX = e.clientX - rect.left
    setHoverIdx(Math.max(0, Math.min(pts.length - 1, Math.round(relX / stepX))))
  }

  return (
    <div className="spark-wrap">
      <svg
        width={width}
        height={height}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
        className="spark-svg"
      >
        <polygon points={`0,${height} ${pointsAttr} ${width},${height}`} fill={color} opacity={0.12} />
        <polyline
          points={pointsAttr}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {hoverIdx !== null && <line x1={hx} y1={0} x2={hx} y2={height} className="spark-crosshair" />}
        <circle cx={hx} cy={hy} r={hoverIdx !== null ? 3.5 : 2.5} fill={color} />
      </svg>
      {hoverIdx !== null && (
        <div className="spark-tip" style={{ left: `${(hx / width) * 100}%` }}>
          {formatValue(data[hoverIdx])}
        </div>
      )}
    </div>
  )
}
