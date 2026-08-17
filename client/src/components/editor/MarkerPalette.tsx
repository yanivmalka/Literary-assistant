import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
import { useMapStore } from '@/stores/mapStore'
import { MARKER_DEFINITIONS } from '@/lib/types'
import type { MarkerType, MarkerDefinition, MarkerShape } from '@/lib/types'

const SHAPES: MarkerShape[] = ['circle', 'dot', 'polygon', 'line', 'triangle', 'square']

export default function MarkerPalette() {
  const { t } = useTranslation()
  const { activeToolType, setActiveTool, activeShape, setActiveShape } = useMapStore()
  const [customMarkers, setCustomMarkers] = useState<MarkerDefinition[]>([])
  const [showEditor, setShowEditor] = useState(false)
  const [editingMarker, setEditingMarker] = useState<MarkerDefinition | null>(null)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6366F1')
  const [newShape, setNewShape] = useState<MarkerShape>('circle')

  const allMarkers = [...MARKER_DEFINITIONS, ...customMarkers]

  const handleDragStart = (e: React.DragEvent, type: MarkerType) => {
    e.dataTransfer.setData('marker-type', type)
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleMarkerClick = (def: MarkerDefinition) => {
    if (activeToolType === def.type) {
      setActiveTool(null)
    } else {
      setActiveTool(def.type)
      setActiveShape(def.shape)
    }
  }

  const handleAddCustom = () => {
    setEditingMarker(null)
    setNewName('')
    setNewColor('#6366F1')
    setNewShape('circle')
    setShowEditor(true)
  }

  const handleEditCustom = (marker: MarkerDefinition) => {
    setEditingMarker(marker)
    setNewName(marker.labelKey)
    setNewColor(marker.color)
    setNewShape(marker.shape)
    setShowEditor(true)
  }

  const handleDeleteCustom = (type: string) => {
    setCustomMarkers(prev => prev.filter(m => m.type !== type))
  }

  const handleSaveCustom = () => {
    if (!newName.trim()) return
    if (editingMarker) {
      setCustomMarkers(prev => prev.map(m =>
        m.type === editingMarker.type
          ? { ...m, labelKey: newName.trim(), color: newColor, shape: newShape }
          : m
      ))
    } else {
      const id = `custom_${Date.now()}`
      setCustomMarkers(prev => [...prev, {
        type: id as MarkerType,
        labelKey: newName.trim(),
        color: newColor,
        shape: newShape,
        size: 12,
        isCustom: true,
        hasShapeMenu: true,
        resizable: true,
        rotatable: true,
      }])
    }
    setShowEditor(false)
  }

  return (
    <div className="w-56 border-e bg-card p-3 overflow-y-auto">
      <h3 className="text-sm font-semibold mb-3 px-1">
        {t('editor.markers.title')}
      </h3>

      <div className="space-y-0.5">
        {allMarkers.map((def) => (
          <div key={def.type}>
            <div className="flex items-center group">
              <button
                draggable
                onDragStart={(e) => handleDragStart(e, def.type)}
                onClick={() => handleMarkerClick(def)}
                className={`flex-1 flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors text-start ${
                  activeToolType === def.type
                    ? 'bg-primary/10 text-primary border border-primary/30'
                    : 'hover:bg-accent'
                }`}
              >
                <PaletteIcon type={def.type} size={18} />
                <span className="truncate">{def.isCustom ? def.labelKey : t(def.labelKey)}</span>
              </button>
              {def.isCustom && (
                <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleEditCustom(def)} className="p-1 hover:bg-accent rounded">
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button onClick={() => handleDeleteCustom(def.type)} className="p-1 hover:bg-accent rounded text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Shape submenu */}
            {activeToolType === def.type && (def.hasShapeMenu || def.isCustom) && (
              <div className="ms-6 mt-1 mb-2 p-1.5 bg-muted/50 rounded-md flex gap-1 flex-wrap">
                {SHAPES.map((shapeOpt) => (
                  <button
                    key={shapeOpt}
                    onClick={() => setActiveShape(shapeOpt)}
                    className={`p-1.5 border rounded flex items-center justify-center ${
                      activeShape === shapeOpt ? 'border-primary bg-primary/10' : 'hover:bg-accent border-transparent'
                    }`}
                    title={shapeOpt}
                  >
                    <ShapeIcon color={def.color} strokeColor={def.strokeColor} shape={shapeOpt} size={14} />
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={handleAddCustom}
        className="w-full mt-3 flex items-center gap-2 px-3 py-2 rounded-md text-sm border border-dashed hover:bg-accent transition-colors"
      >
        <Plus className="h-4 w-4" />
        {t('editor.markers.addCustom')}
      </button>

      <p className="text-xs text-muted-foreground mt-4 px-1">
        {t('editor.markers.instructions')}
      </p>

      {/* Custom Marker Editor Dialog */}
      {showEditor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border rounded-lg p-5 w-full max-w-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">
                {editingMarker ? t('editor.markers.editMarker') : t('editor.markers.addCustom')}
              </h3>
              <button onClick={() => setShowEditor(false)} className="p-1 hover:bg-accent rounded">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">{t('editor.markers.markerName')}</label>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full px-2 py-1.5 text-sm border rounded bg-background" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">{t('editor.markers.markerColor')}</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="h-8 w-8 rounded border cursor-pointer" />
                  <span className="text-xs text-muted-foreground">{newColor}</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">{t('editor.markers.markerShape')}</label>
                <div className="grid grid-cols-6 gap-1">
                  {SHAPES.map((shapeOpt) => (
                    <button key={shapeOpt} onClick={() => setNewShape(shapeOpt)} className={`p-2 border rounded flex items-center justify-center ${newShape === shapeOpt ? 'border-primary bg-primary/10' : 'hover:bg-accent'}`}>
                      <ShapeIcon color={newColor} shape={shapeOpt} size={14} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowEditor(false)} className="px-3 py-1.5 text-sm border rounded hover:bg-accent">{t('common.cancel')}</button>
              <button onClick={handleSaveCustom} disabled={!newName.trim()} className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50">{t('common.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// Palette icons - illustrative/thematic per marker type
// These are decorative and only appear in the sidebar and naming panel
// ============================================
export function PaletteIcon({ type, size = 18 }: { type: string; size?: number }) {
  switch (type) {
    case 'water':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18">
          <path d="M2 9 Q5 7 7 9 Q9 11 11 9 Q13 7 16 9" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" />
          <path d="M2 13 Q5 11 7 13 Q9 15 11 13 Q13 11 16 13" fill="none" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
        </svg>
      )
    case 'ice':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18">
          <rect x="4" y="4" width="10" height="10" rx="2" fill="#E0F2FE" stroke="#7DD3FC" strokeWidth="1.5" />
          <line x1="7" y1="4" x2="7" y2="14" stroke="#BAE6FD" strokeWidth="0.5" />
          <line x1="11" y1="4" x2="11" y2="14" stroke="#BAE6FD" strokeWidth="0.5" />
          <path d="M5 8 L8 6 L10 8" fill="none" stroke="#7DD3FC" strokeWidth="0.7" />
        </svg>
      )
    case 'forest':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18">
          <polygon points="9,2 4,10 6,10 3,15 15,15 12,10 14,10" fill="#22C55E" />
          <rect x="8" y="14" width="2" height="3" fill="#92400E" />
        </svg>
      )
    case 'desert':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18">
          <path d="M1 14 Q4 10 7 12 Q10 14 13 10 Q15 8 17 11 L17 17 L1 17 Z" fill="#EAB308" />
          <path d="M3 13 Q5 11 7 12" fill="none" stroke="#CA8A04" strokeWidth="0.5" />
        </svg>
      )
    case 'steppe':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18">
          <line x1="4" y1="15" x2="5" y2="9" stroke="#86EFAC" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="7" y1="15" x2="8" y2="8" stroke="#4ADE80" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="10" y1="15" x2="9.5" y2="9.5" stroke="#86EFAC" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="13" y1="15" x2="12.5" y2="10" stroke="#4ADE80" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="5.5" y1="15" x2="6.5" y2="11" stroke="#BBF7D0" strokeWidth="1" strokeLinecap="round" />
        </svg>
      )
    case 'swamp':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18">
          <ellipse cx="9" cy="12" rx="7" ry="4" fill="#92400E" opacity="0.6" />
          <ellipse cx="9" cy="11" rx="5" ry="3" fill="#78350F" opacity="0.4" />
          <circle cx="6" cy="10" r="1" fill="#A3E635" opacity="0.7" />
          <circle cx="12" cy="11" r="0.8" fill="#A3E635" opacity="0.5" />
        </svg>
      )
    case 'mountains':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18">
          <polygon points="9,3 2,15 16,15" fill="#6B7280" />
          <polygon points="6,15 9,9 12,15" fill="#9CA3AF" opacity="0.3" />
        </svg>
      )
    case 'highMountains':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18">
          <polygon points="9,2 2,15 16,15" fill="#6B7280" stroke="#6B7280" strokeWidth="0.5" />
          <polygon points="9,2 7,6 11,6" fill="white" />
        </svg>
      )
    case 'capital':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18">
          <polygon points="2,14 2,8 4,5 6,9 9,2 12,9 14,5 16,8 16,14" fill="#D4A017" stroke="#B8860B" strokeWidth="0.5" />
          <polygon points="4,8 6,9 9,4 12,9 14,8 13,13 5,13" fill="#8B1A1A" />
          <rect x="2" y="13" width="14" height="2" fill="#C49B08" stroke="#B8860B" strokeWidth="0.3" />
        </svg>
      )
    case 'city':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18">
          <circle cx="9" cy="9" r="5" fill="#1F2937" />
        </svg>
      )
    case 'village':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18">
          <circle cx="9" cy="9" r="4" fill="#166534" />
        </svg>
      )
    case 'borders':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18">
          <line x1="2" y1="15" x2="16" y2="3" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 2" />
        </svg>
      )
    default:
      // Custom markers - use color circle
      const def = MARKER_DEFINITIONS.find(d => d.type === type)
      return (
        <svg width={size} height={size} viewBox="0 0 18 18">
          <circle cx="9" cy="9" r="6" fill={def?.color || '#6366F1'} opacity="0.8" stroke={def?.strokeColor || def?.color || '#6366F1'} strokeWidth="1.5" />
        </svg>
      )
  }
}

// ============================================
// Shape icons - geometric shapes for shape submenu
// ============================================
export function ShapeIcon({ color, strokeColor, shape, size }: { color: string; strokeColor?: string; shape: string; size: number }) {
  const stroke = strokeColor || color
  if (shape === 'triangle') {
    return (<svg width={size} height={size} viewBox="0 0 16 16"><polygon points="8,2 14,14 2,14" fill={color} stroke={strokeColor || 'none'} strokeWidth={strokeColor ? 1.5 : 0} /></svg>)
  }
  if (shape === 'polygon') {
    return (<svg width={size} height={size} viewBox="0 0 16 16"><polygon points="8,1 15,6 12,15 4,15 1,6" fill={color} stroke={strokeColor || 'none'} strokeWidth={strokeColor ? 1.5 : 0} /></svg>)
  }
  if (shape === 'line') {
    return (<svg width={size} height={size} viewBox="0 0 16 16"><line x1="2" y1="14" x2="14" y2="2" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" /></svg>)
  }
  if (shape === 'square') {
    return (<svg width={size} height={size} viewBox="0 0 16 16"><rect x="3" y="3" width="10" height="10" fill={color} stroke={strokeColor || 'none'} strokeWidth={strokeColor ? 1.5 : 0} /></svg>)
  }
  if (shape === 'dot') {
    return (<svg width={size} height={size} viewBox="0 0 16 16"><circle cx="8" cy="8" r="4" fill={color} stroke={strokeColor || 'none'} strokeWidth={strokeColor ? 1.5 : 0} /></svg>)
  }
  // Default circle
  return (<svg width={size} height={size} viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill={color} opacity="0.7" stroke={strokeColor || color} strokeWidth="1.5" /></svg>)
}
