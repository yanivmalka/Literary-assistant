import { useId } from 'react'

interface SwordProgressBarProps {
  percentage: number
}

// A single sword silhouette, pointing toward the reading-progress direction (end of the row).
// The blade/guard/grip/pommel are one continuous shape so the fill can sweep through
// the whole sword rather than sitting as a decoration next to a separate bar.
const SWORD_PATH =
  'M198 20 L150 8 L44 8 L44 2 L36 2 L36 38 L44 38 L44 32 L150 32 Z ' +
  'M12 14 L36 14 L36 26 L12 26 Z ' +
  'M8 20 m-8 0 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0'

export default function SwordProgressBar({ percentage }: SwordProgressBarProps) {
  const clipId = useId()
  const clampedPercentage = Math.min(100, Math.max(0, percentage))

  return (
    <svg
      viewBox="0 0 200 40"
      className="w-full h-4"
      preserveAspectRatio="none"
      role="img"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <rect
            x="0"
            y="0"
            height="40"
            style={{ width: `${clampedPercentage * 2}px`, transition: 'width 500ms ease-out' }}
          />
        </clipPath>
      </defs>

      {/* Unfilled sword: blends into the extraction panel's own background, not a separate track color */}
      <path d={SWORD_PATH} className="fill-blue-50" />

      {/* Fill: the same sword, clipped to the current progress */}
      <g clipPath={`url(#${clipId})`}>
        <path d={SWORD_PATH} className="fill-blue-500" />
      </g>
    </svg>
  )
}
