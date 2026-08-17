import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Check, RefreshCw } from 'lucide-react'
import { useMapStore } from '@/stores/mapStore'
import { MARKER_DEFINITIONS } from '@/lib/types'
import { generateFantasyNames } from '@/lib/nameGenerator'

export default function NamingPanel() {
  const { t, i18n } = useTranslation()
  const { markers, regions, updateMarker, updateRegion } = useMapStore()
  const [suggestingFor, setSuggestingFor] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])

  // Get unnamed markers (excluding borders which don't need names)
  const unnamedMarkers = markers.filter(
    m => !m.name && !m.noNameNeeded && m.type !== 'borders' && !m.regionId
  )
  const unnamedRegions = regions.filter(r => !r.name && !r.noNameNeeded)

  const getMarkerLabel = (type: string): string => {
    const def = MARKER_DEFINITIONS.find(d => d.type === type)
    if (def) return t(def.labelKey)
    return type
  }

  const handleSuggestNames = (id: string) => {
    setSuggestingFor(id)
    const names = generateFantasyNames(i18n.language, 5)
    setSuggestions(names)
  }

  const handleRefreshSuggestions = () => {
    const names = generateFantasyNames(i18n.language, 5)
    setSuggestions(names)
  }

  const applyNameToMarker = (markerId: string, name: string) => {
    updateMarker(markerId, { name })
    setSuggestingFor(null)
    setSuggestions([])
  }

  const applyNameToRegion = (regionId: string, name: string) => {
    updateRegion(regionId, { name })
    setSuggestingFor(null)
    setSuggestions([])
  }

  return (
    <div className="p-4 border-b">
      <h3 className="text-sm font-semibold mb-3">{t('editor.naming.title')}</h3>

      {unnamedMarkers.length === 0 && unnamedRegions.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('editor.naming.allNamed')}</p>
      ) : (
        <div className="space-y-2">
          {/* Unnamed regions */}
          {unnamedRegions.map((region) => (
            <div key={region.id} className="border rounded p-2 text-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium">{getMarkerLabel(region.type)}</span>
              </div>
              <input
                type="text"
                placeholder={t('editor.naming.enterName')}
                className="w-full px-2 py-1 text-xs border rounded bg-background"
                onBlur={(e) => {
                  if (e.target.value.trim()) {
                    applyNameToRegion(region.id, e.target.value.trim())
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                    applyNameToRegion(region.id, (e.target as HTMLInputElement).value.trim())
                  }
                }}
              />
              <div className="flex items-center gap-2 mt-1">
                <button
                  onClick={() => handleSuggestNames(region.id)}
                  className="text-xs text-primary flex items-center gap-1 hover:underline"
                >
                  <Sparkles className="h-3 w-3" />
                  {t('editor.naming.suggestName')}
                </button>
                <button
                  onClick={() => updateRegion(region.id, { noNameNeeded: true })}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  {t('editor.naming.noNameNeeded')}
                </button>
              </div>
            </div>
          ))}

          {/* Unnamed markers */}
          {unnamedMarkers.map((marker) => {
            const def = MARKER_DEFINITIONS.find(d => d.type === marker.type)
            return (
              <div key={marker.id} className="border rounded p-2 text-sm">
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: def?.color }}
                  />
                  <span className="font-medium">{getMarkerLabel(marker.type)}</span>
                </div>
                <input
                  type="text"
                  placeholder={t('editor.naming.enterName')}
                  className="w-full px-2 py-1 text-xs border rounded bg-background"
                  onBlur={(e) => {
                    if (e.target.value.trim()) {
                      applyNameToMarker(marker.id, e.target.value.trim())
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                      applyNameToMarker(marker.id, (e.target as HTMLInputElement).value.trim())
                    }
                  }}
                />
                <div className="flex items-center gap-2 mt-1">
                  <button
                    onClick={() => handleSuggestNames(marker.id)}
                    className="text-xs text-primary flex items-center gap-1 hover:underline"
                  >
                    <Sparkles className="h-3 w-3" />
                    {t('editor.naming.suggestName')}
                  </button>
                  <button
                    onClick={() => updateMarker(marker.id, { noNameNeeded: true })}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    {t('editor.naming.noNameNeeded')}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Suggestions popup with refresh */}
      {suggestingFor && (
        <div className="mt-3 border rounded p-2 bg-secondary/50">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium">{t('editor.naming.suggestions')}</p>
            <button
              onClick={handleRefreshSuggestions}
              className="p-1 hover:bg-accent rounded transition-colors"
              title={t('editor.naming.refresh')}
            >
              <RefreshCw className="h-3.5 w-3.5 text-primary" />
            </button>
          </div>
          <div className="space-y-1">
            {suggestions.map((name, idx) => (
              <button
                key={`${name}-${idx}`}
                onClick={() => {
                  const isRegion = regions.some(r => r.id === suggestingFor)
                  if (isRegion) {
                    applyNameToRegion(suggestingFor, name)
                  } else {
                    applyNameToMarker(suggestingFor, name)
                  }
                }}
                className="w-full text-start px-2 py-1 text-xs rounded hover:bg-accent flex items-center gap-2"
              >
                <Check className="h-3 w-3 text-primary" />
                {name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
