import { useId } from 'react'
import { useTranslation } from 'react-i18next'

interface SwordProgressBarProps {
  percentage: number
}

// Sword silhouette in a fixed left-to-right (hilt -> tip) local coordinate space.
// RTL locales mirror the whole <svg> instead of re-deriving coordinates, so the
// glow always animates hilt -> tip regardless of reading direction.
const POMMEL = { cx: 16, cy: 30, r: 13 }
const POMMEL_STAR_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315]

const GRIP_PATH = 'M30 21 Q30 18 34 18 L58 18 Q62 18 62 21 L62 39 Q62 42 58 42 L34 42 Q30 42 30 39 Z'
const GRIP_WRAPS = [36, 42, 48, 54]

const GUARD_BAR = 'M60 10 Q68 10 68 15 L68 45 Q68 50 60 50 Q56 50 56 45 L56 15 Q56 10 60 10 Z'
const GUARD_HORN_TOP = 'M64 18 C80 6 100 2 97 12 C94 20 80 18 68 23 Z'
const GUARD_HORN_BOTTOM = 'M64 42 C80 54 100 58 97 48 C94 40 80 42 68 37 Z'

const BLADE_PATH = 'M66 24 L200 27.5 L400 29.5 L488 30 L400 30.5 L200 32.5 L66 36 Z'
const BLADE_HIGHLIGHT = 'M80 26 L400 29.2 L470 29.7'
const BLADE_CENTERLINE_START = 84
const BLADE_CENTERLINE_END = 472

const SPARKLE_POSITIONS = [130, 220, 310, 400]

export default function SwordProgressBar({ percentage }: SwordProgressBarProps) {
  const { i18n } = useTranslation()
  const isRtl = i18n.dir() === 'rtl'
  const clipId = useId()
  const glowFilterId = useId()
  const steelGradientId = useId()
  const hiltGradientId = useId()
  const glowGradientId = useId()

  const clampedPercentage = Math.min(100, Math.max(0, percentage))
  const filledLength = (clampedPercentage / 100) * (BLADE_CENTERLINE_END - BLADE_CENTERLINE_START)

  return (
    <svg
      viewBox="0 0 500 60"
      className="w-full h-7"
      preserveAspectRatio="none"
      style={{ transform: isRtl ? 'scaleX(-1)' : undefined }}
      role="img"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={steelGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#94a3b8" />
          <stop offset="40%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0b1220" />
        </linearGradient>
        <linearGradient id={hiltGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#475569" />
          <stop offset="55%" stopColor="#1e1b4b" />
          <stop offset="100%" stopColor="#0b1220" />
        </linearGradient>
        <linearGradient id={glowGradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="50%" stopColor="#bfdbfe" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
        <filter id={glowFilterId} x="-50%" y="-300%" width="200%" height="700%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <clipPath id={clipId}>
          <rect
            x={BLADE_CENTERLINE_START}
            y="0"
            height="60"
            style={{ width: `${filledLength}px`, transition: 'width 500ms ease-out' }}
          />
        </clipPath>
      </defs>

      {/* Pommel */}
      <circle {...POMMEL} fill={`url(#${hiltGradientId})`} stroke="#64748b" strokeWidth="1" />
      <circle cx={POMMEL.cx} cy={POMMEL.cy} r={5} fill="none" stroke="#94a3b8" strokeWidth="1" opacity="0.7" />
      {POMMEL_STAR_ANGLES.map((angle) => {
        const rad = (angle * Math.PI) / 180
        const x1 = POMMEL.cx + Math.cos(rad) * 3
        const y1 = POMMEL.cy + Math.sin(rad) * 3
        const x2 = POMMEL.cx + Math.cos(rad) * 8
        const y2 = POMMEL.cy + Math.sin(rad) * 8
        return <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#cbd5e1" strokeWidth="0.75" opacity="0.6" />
      })}

      {/* Grip */}
      <path d={GRIP_PATH} fill={`url(#${hiltGradientId})`} stroke="#64748b" strokeWidth="1" />
      {GRIP_WRAPS.map((x) => (
        <line key={x} x1={x - 3} y1="42" x2={x + 3} y2="18" stroke="#94a3b8" strokeWidth="1" opacity="0.45" />
      ))}

      {/* Guard */}
      <path d={GUARD_HORN_TOP} fill={`url(#${hiltGradientId})`} stroke="#64748b" strokeWidth="0.75" />
      <path d={GUARD_HORN_BOTTOM} fill={`url(#${hiltGradientId})`} stroke="#64748b" strokeWidth="0.75" />
      <path d={GUARD_BAR} fill={`url(#${hiltGradientId})`} stroke="#64748b" strokeWidth="1" />

      {/* Blade */}
      <path d={BLADE_PATH} fill={`url(#${steelGradientId})`} stroke="#0b1220" strokeWidth="1" strokeLinejoin="round" />
      <path d={BLADE_HIGHLIGHT} stroke="#94a3b8" strokeWidth="0.75" opacity="0.5" fill="none" />
      <path
        d={`M${BLADE_CENTERLINE_START} 30 L${BLADE_CENTERLINE_END} 30`}
        stroke="#0b1220"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.65"
      />

      {/* Glowing progress fill, clipped to the current percentage */}
      <g clipPath={`url(#${clipId})`} filter={`url(#${glowFilterId})`}>
        <path
          d={`M${BLADE_CENTERLINE_START} 30 L${BLADE_CENTERLINE_END} 30`}
          stroke={`url(#${glowGradientId})`}
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        {SPARKLE_POSITIONS.map((x) => (
          <circle key={x} cx={x} cy={30 + (x % 3 === 0 ? -1.5 : 1.5)} r="0.9" fill="#eff6ff" opacity="0.9" />
        ))}
      </g>
    </svg>
  )
}
