import { useTranslation } from 'react-i18next'
import { useMapStore } from '@/stores/mapStore'
import { MARKER_DEFINITIONS } from '@/lib/types'
import type { MarkerType } from '@/lib/types'

export default function MarkerPalette() {
  const { t } = useTranslation()
  const { activeToolType, setActiveTool } = useMapStore()

  const handleDragStart = (e: React.DragEvent, type: MarkerType) => {
    e.dataTransfer.setData('marker-type', type)
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div className="w-56 border-e bg-card p-3 overflow-y-auto">
      <h3 className="text-sm font-semibold mb-3 px-1">
        {t('editor.markers.title')}
      </h3>
      <div className="space-y-1">
        {MARKER_DEFINITIONS.map((def) => (
          <button
            key={def.type}
            draggable
            onDragStart={(e) => handleDragStart(e, def.type)}
            onClick={() => setActiveTool(activeToolType === def.type ? null : def.type)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors text-start ${
              activeToolType === def.type
                ? 'bg-primary/10 text-primary border border-primary/30'
                : 'hover:bg-accent'
            }`}
          >
            <MarkerIcon type={def.type} color={def.color} shape={def.shape} size={16} />
            <span className="truncate">{t(def.labelKey)}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-4 px-1">
        Click to select tool, then click on map to place. Or drag marker directly onto the canvas.
      </p>
    </div>
  )
}

function MarkerIcon({ color, shape, size }: { type: string; color: string; shape: string; size: number }) {
  if (shape === 'triangle') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16">
        <polygon points="8,2 14,14 2,14" fill={color} />
      </svg>
    )
  }
  if (shape === 'crown') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16">
        <path d="M2 12 L4 5 L8 8 L12 5 L14 12 Z" fill={color} />
        <circle cx="4" cy="4" r="1.5" fill={color} />
        <circle cx="8" cy="2" r="1.5" fill={color} />
        <circle cx="12" cy="4" r="1.5" fill={color} />
      </svg>
    )
  }
  if (shape === 'dot') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="4" fill={color} />
      </svg>
    )
  }
  // Default circle
  return (
    <svg width={size} height={size} viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="6" fill={color} opacity={0.7} />
      <circle cx="8" cy="8" r="6" stroke={color} strokeWidth="1.5" fill="none" />
    </svg>
  )
}
