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
            {/* Marker button */}
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
                <MarkerIcon color={def.color} strokeColor={def.strokeColor} shape={def.shape} size={16} />
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

            {/* Shape submenu - shown below marker when active and has shape menu */}
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
                    <MarkerIcon color={def.color} strokeColor={def.strokeColor} shape={shapeOpt} size={14} />
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add custom marker button */}
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
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border rounded bg-background"
                  autoFocus
                />
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
                    <button
                      key={shapeOpt}
                      onClick={() => setNewShape(shapeOpt)}
                      className={`p-2 border rounded flex items-center justify-center ${newShape === shapeOpt ? 'border-primary bg-primary/10' : 'hover:bg-accent'}`}
                    >
                      <MarkerIcon color={newColor} shape={shapeOpt} size={14} />
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

export function MarkerIcon({ color, strokeColor, shape, size }: { color: string; strokeColor?: string; shape: string; size: number }) {
  const stroke = strokeColor || color
  if (shape === 'triangle') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16">
        <polygon points="8,2 14,14 2,14" fill={color} stroke={strokeColor || 'none'} strokeWidth={strokeColor ? 1.5 : 0} />
      </svg>
    )
  }
  if (shape === 'polygon') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16">
        <polygon points="8,1 15,6 12,15 4,15 1,6" fill={color} stroke={strokeColor || 'none'} strokeWidth={strokeColor ? 1.5 : 0} />
      </svg>
    )
  }
  if (shape === 'crown') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16">
        <path d="M2 12 L4 4 L8 7 L12 4 L14 12 Z" fill={color} stroke={strokeColor || 'none'} strokeWidth={strokeColor ? 1 : 0} />
        <circle cx="4" cy="3.5" r="1.2" fill={color} />
        <circle cx="8" cy="1.5" r="1.2" fill={color} />
        <circle cx="12" cy="3.5" r="1.2" fill={color} />
      </svg>
    )
  }
  if (shape === 'line') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16">
        <line x1="2" y1="14" x2="14" y2="2" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    )
  }
  if (shape === 'square') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16">
        <rect x="3" y="3" width="10" height="10" fill={color} stroke={strokeColor || 'none'} strokeWidth={strokeColor ? 1.5 : 0} />
      </svg>
    )
  }
  if (shape === 'dot') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="4" fill={color} stroke={strokeColor || 'none'} strokeWidth={strokeColor ? 1.5 : 0} />
      </svg>
    )
  }
  // Default circle
  return (
    <svg width={size} height={size} viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="6" fill={color} opacity={0.7} stroke={strokeColor || color} strokeWidth="1.5" />
    </svg>
  )
}
