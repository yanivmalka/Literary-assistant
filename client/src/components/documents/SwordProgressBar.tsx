import { useId } from 'react'
import { useTranslation } from 'react-i18next'

interface SwordProgressBarProps {
  percentage: number
}

// A classic sword silhouette in a fixed left-to-right (pommel -> tip) local
// coordinate space. RTL locales mirror the whole <svg> instead of
// re-deriving coordinates, so the fill always animates pommel -> tip
// regardless of reading direction.
//
// The whole sword is the progress bar: an empty (muted) sword — pommel,
// grip, crossguard, blade — sits underneath, and an identical copy is
// clipped to the current percentage and drawn in the glowing accent color
// on top, the same track-plus-fill mechanism as the plain progress bar,
// just sword-shaped and continuous end to end.
const POMMEL_CX = 8
const GUARD_X = 26
const BLADE_START = 30 // where the blade begins, just past the guard
const BLADE_TIP = 494
const BLADE_HALF_WIDTH = 5 // half-width of the blade at the guard, tapering to a point
const SWORD_START = POMMEL_CX - 3.5 // leftmost extent of the pommel — where the fill begins
const SWORD_END = BLADE_TIP

const bladePath = `M${BLADE_START} ${16 - BLADE_HALF_WIDTH} L${BLADE_TIP} 16 L${BLADE_START} ${16 + BLADE_HALF_WIDTH} Z`

function SwordShape({ fill, opacity }: { fill: string; opacity?: number }) {
  return (
    <g fill={fill} opacity={opacity}>
      <circle cx={POMMEL_CX} cy="16" r="3.5" />
      <rect x="13" y="13" width="10" height="6" rx="1.5" />
      <rect x={GUARD_X} y="6" width="2.5" height="20" rx="1.25" />
      <path d={bladePath} />
    </g>
  )
}

export default function SwordProgressBar({ percentage }: SwordProgressBarProps) {
  const { i18n } = useTranslation()
  const isRtl = i18n.dir() === 'rtl'
  const clipId = useId()
  const glowFilterId = useId()
  const bladeGradientId = useId()
  const glowGradientId = useId()

  const clampedPercentage = Math.min(100, Math.max(0, percentage))
  const filledLength = (clampedPercentage / 100) * (SWORD_END - SWORD_START)

  return (
    <svg
      viewBox="0 0 500 32"
      className="w-full h-6"
      preserveAspectRatio="none"
      style={{ transform: isRtl ? 'scaleX(-1)' : undefined }}
      role="img"
      aria-hidden="true"
    >
      <defs>
        {/* Muted steel — the same quiet, low-chroma language as the plain
            progress bar's empty track, not a separate illustration palette. */}
        <linearGradient id={bladeGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.3" />
          <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.3" />
        </linearGradient>
        {/* Progress glow — the accent color, so it follows the user's
            chosen theme accent exactly like the plain bar's fill does. */}
        <linearGradient id={glowGradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(var(--primary))" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.85" />
        </linearGradient>
        <filter id={glowFilterId} x="-20%" y="-200%" width="140%" height="500%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <clipPath id={clipId}>
          <rect
            x={SWORD_START}
            y="0"
            height="32"
            style={{ width: `${filledLength}px`, transition: 'width 500ms ease-out' }}
          />
        </clipPath>
      </defs>

      {/* Empty sword — pommel, grip, crossguard, blade — the full muted track. */}
      <SwordShape fill={`url(#${bladeGradientId})`} />

      {/* Glowing progress fill: the same sword, clipped to the current percentage. */}
      <g clipPath={`url(#${clipId})`} filter={`url(#${glowFilterId})`}>
        <SwordShape fill={`url(#${glowGradientId})`} />
      </g>
    </svg>
  )
}
