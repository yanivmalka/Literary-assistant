import { useId } from 'react'
import { useTranslation } from 'react-i18next'

interface SwordProgressBarProps {
  percentage: number
}

// Sword silhouette in a fixed left-to-right (hilt -> tip) local coordinate space.
// RTL locales mirror the whole <svg> instead of re-deriving coordinates, so the
// glow always animates hilt -> tip regardless of reading direction.
const POMMEL_OUTER = { cx: 18, cy: 35, r: 15 }
const POMMEL_INNER = { cx: 18, cy: 35, r: 6 }
const GRIP_WRAPS = [42, 50, 58]

const HILT_PATH =
  'M34 25 L66 25 Q71 25 71 30 L71 40 Q71 45 66 45 L34 45 Q29 45 29 40 L29 30 Q29 25 34 25 Z'
const GUARD_BAR = 'M68 12 L76 12 Q79 12 79 15 L79 55 Q79 58 76 58 L68 58 Z'
const GUARD_QUILLON_TOP = 'M76 14 C96 5 110 12 101 19 C91 15 81 17 76 22 Z'
const GUARD_QUILLON_BOTTOM = 'M76 56 C96 65 110 58 101 51 C91 55 81 53 76 48 Z'
const BLADE_PATH = 'M78 26 L210 29.5 L340 33 L396 35 L340 37 L210 40.5 L78 44 Z'
const BLADE_CENTERLINE_START = 92
const BLADE_CENTERLINE_END = 382

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
      viewBox="0 0 400 70"
      className="w-full h-7"
      preserveAspectRatio="none"
      style={{ transform: isRtl ? 'scaleX(-1)' : undefined }}
      role="img"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={steelGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#64748b" />
          <stop offset="45%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id={hiltGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#334155" />
          <stop offset="55%" stopColor="#1e1b4b" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id={glowGradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="55%" stopColor="#93c5fd" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
        <filter id={glowFilterId} x="-50%" y="-200%" width="200%" height="500%">
          <feGaussianBlur stdDeviation="3.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <clipPath id={clipId}>
          <rect
            x={BLADE_CENTERLINE_START}
            y="0"
            height="70"
            style={{ width: `${filledLength}px`, transition: 'width 500ms ease-out' }}
          />
        </clipPath>
      </defs>

      {/* Pommel */}
      <circle {...POMMEL_OUTER} fill={`url(#${hiltGradientId})`} stroke="#475569" strokeWidth="1" />
      <circle {...POMMEL_INNER} fill="none" stroke="#94a3b8" strokeWidth="1" opacity="0.6" />

      {/* Grip */}
      <path d={HILT_PATH} fill={`url(#${hiltGradientId})`} stroke="#475569" strokeWidth="1" />
      {GRIP_WRAPS.map((x) => (
        <line key={x} x1={x} y1="27" x2={x} y2="43" stroke="#94a3b8" strokeWidth="1" opacity="0.4" />
      ))}

      {/* Guard */}
      <path d={GUARD_QUILLON_TOP} fill={`url(#${hiltGradientId})`} stroke="#475569" strokeWidth="0.75" />
      <path d={GUARD_QUILLON_BOTTOM} fill={`url(#${hiltGradientId})`} stroke="#475569" strokeWidth="0.75" />
      <path d={GUARD_BAR} fill={`url(#${hiltGradientId})`} stroke="#475569" strokeWidth="1" />

      {/* Blade */}
      <path d={BLADE_PATH} fill={`url(#${steelGradientId})`} stroke="#0f172a" strokeWidth="1" strokeLinejoin="round" />
      <path
        d={`M${BLADE_CENTERLINE_START} 35 L${BLADE_CENTERLINE_END} 35`}
        stroke="#0f172a"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.6"
      />

      {/* Glowing progress fill, clipped to the current percentage */}
      <g clipPath={`url(#${clipId})`} filter={`url(#${glowFilterId})`}>
        <path
          d={`M${BLADE_CENTERLINE_START} 35 L${BLADE_CENTERLINE_END} 35`}
          stroke={`url(#${glowGradientId})`}
          strokeWidth="4.5"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}
