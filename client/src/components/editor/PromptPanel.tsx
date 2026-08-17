import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Wand2, Copy, Check, History } from 'lucide-react'
import { useMapStore } from '@/stores/mapStore'
import { supabase } from '@/lib/supabase'
import { MARKER_DEFINITIONS } from '@/lib/types'
import type { CanvasMarker, CanvasRegion } from '@/lib/types'

export default function PromptPanel() {
  const { t } = useTranslation()
  const { currentMap, markers, regions } = useMapStore()
  const [prompt, setPrompt] = useState('')
  const [copied, setCopied] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<{ prompt_text: string; created_at: string }[]>([])

  const generatePrompt = async () => {
    if (!currentMap) return

    const generatedPrompt = buildPromptFromCanvas(
      currentMap.material,
      currentMap.map_type,
      currentMap.description || '',
      markers,
      regions
    )

    setPrompt(generatedPrompt)

    // Save to history
    await supabase.from('prompt_history').insert({
      map_id: currentMap.id,
      prompt_text: generatedPrompt,
      canvas_snapshot: { markers, regions, viewportX: 0, viewportY: 0, scale: 1 },
    })
  }

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const loadHistory = async () => {
    if (!currentMap) return
    const { data } = await supabase
      .from('prompt_history')
      .select('prompt_text, created_at')
      .eq('map_id', currentMap.id)
      .order('created_at', { ascending: false })
      .limit(10)

    setHistory(data || [])
    setShowHistory(true)
  }

  return (
    <div className="p-4 border-b">
      <h3 className="text-sm font-semibold mb-3">{t('editor.prompt.title')}</h3>

      <button
        onClick={generatePrompt}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors mb-3"
      >
        <Wand2 className="h-4 w-4" />
        {t('editor.prompt.generate')}
      </button>

      {prompt && (
        <div className="space-y-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full px-2 py-2 text-xs border rounded bg-background resize-none font-mono"
            rows={8}
          />
          <button
            onClick={copyToClipboard}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 border rounded-md text-sm hover:bg-accent transition-colors"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? t('editor.prompt.copied') : t('editor.prompt.copy')}
          </button>
        </div>
      )}

      <button
        onClick={loadHistory}
        className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground mt-2"
      >
        <History className="h-3.5 w-3.5" />
        {t('editor.prompt.history')}
      </button>

      {showHistory && history.length > 0 && (
        <div className="mt-2 border rounded p-2 max-h-32 overflow-y-auto">
          {history.map((item, i) => (
            <button
              key={i}
              onClick={() => { setPrompt(item.prompt_text); setShowHistory(false) }}
              className="w-full text-start px-2 py-1 text-xs rounded hover:bg-accent truncate"
            >
              {new Date(item.created_at).toLocaleDateString()} - {item.prompt_text.slice(0, 40)}...
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================
// Prompt generation logic
// ============================================
function buildPromptFromCanvas(
  material: string,
  mapType: string,
  description: string,
  markers: CanvasMarker[],
  regions: CanvasRegion[]
): string {
  const materialStyles: Record<string, string> = {
    parchment: 'drawn on aged parchment with ink, medieval cartography style',
    paper: 'clean modern map illustration on white paper',
    aged: 'weathered and stained old paper, vintage map style with faded edges',
    leather: 'burned/etched into dark leather, embossed map style',
    stone: 'carved into stone tablet, ancient engraved map style',
  }

  const mapTypeDesc: Record<string, string> = {
    world: 'a full world map showing continents and oceans',
    continent: 'a continent map showing countries and geographical features',
    country: 'a country/kingdom map showing cities, borders, and terrain',
    city: 'a city map showing districts, landmarks, and streets',
    region: 'a regional map showing local geography and settlements',
  }

  // Analyze marker positions to create geographical descriptions
  const canvasWidth = 800 // reference width
  const canvasHeight = 600 // reference height

  const getPosition = (x: number, y: number): string => {
    const col = x < canvasWidth / 3 ? 'western' : x > (canvasWidth * 2) / 3 ? 'eastern' : 'central'
    const row = y < canvasHeight / 3 ? 'northern' : y > (canvasHeight * 2) / 3 ? 'southern' : 'central'
    if (col === 'central' && row === 'central') return 'in the center'
    if (row === 'central') return `in the ${col} part`
    if (col === 'central') return `in the ${row} part`
    return `in the ${row}-${col}`
  }

  let prompt = `Create a fantasy map illustration: ${mapTypeDesc[mapType] || 'a fantasy map'}, ${materialStyles[material] || materialStyles.parchment}.\n\n`

  if (description) {
    prompt += `General description: ${description}\n\n`
  }

  prompt += `The map should include:\n`

  // Named cities and capitals
  const cities = markers.filter(m => m.type === 'city' && m.name)
  const capitals = markers.filter(m => m.type === 'capital' && m.name)

  if (capitals.length > 0) {
    capitals.forEach(c => {
      prompt += `- Capital city "${c.name}" ${getPosition(c.x, c.y)}\n`
    })
  }

  if (cities.length > 0) {
    cities.forEach(c => {
      prompt += `- City "${c.name}" ${getPosition(c.x, c.y)}\n`
    })
  }

  // Villages
  const villages = markers.filter(m => m.type === 'village' && m.name)
  if (villages.length > 0) {
    villages.forEach(v => {
      prompt += `- Village/town "${v.name}" ${getPosition(v.x, v.y)}\n`
    })
  }

  // Mountains
  const mountains = markers.filter(m => m.type === 'mountains')
  if (mountains.length > 0) {
    const mountainRegions = regions.filter(r => r.type === 'mountains')
    if (mountainRegions.length > 0) {
      mountainRegions.forEach(r => {
        prompt += `- Mountain range${r.name ? ` "${r.name}"` : ''} ${getPosition(
          r.boundaryPoints[0]?.x || 0,
          r.boundaryPoints[0]?.y || 0
        )}\n`
      })
    } else {
      prompt += `- Mountains ${getPosition(mountains[0].x, mountains[0].y)}\n`
    }
  }

  // Water features
  const waterRegions = regions.filter(r => r.type === 'water')
  waterRegions.forEach(r => {
    const shape = r.inferredShape || 'lake'
    prompt += `- ${shape}${r.name ? ` "${r.name}"` : ''} ${getPosition(
      r.boundaryPoints[0]?.x || 0,
      r.boundaryPoints[0]?.y || 0
    )}\n`
  })

  // Forests
  const forestRegions = regions.filter(r => r.type === 'forest')
  forestRegions.forEach(r => {
    prompt += `- Forest${r.name ? ` "${r.name}"` : ''} ${getPosition(
      r.boundaryPoints[0]?.x || 0,
      r.boundaryPoints[0]?.y || 0
    )}\n`
  })

  // Deserts
  const desertRegions = regions.filter(r => r.type === 'desert')
  desertRegions.forEach(r => {
    prompt += `- Desert${r.name ? ` "${r.name}"` : ''} ${getPosition(
      r.boundaryPoints[0]?.x || 0,
      r.boundaryPoints[0]?.y || 0
    )}\n`
  })

  // Borders
  const borders = markers.filter(m => m.type === 'borders')
  if (borders.length > 0) {
    prompt += `- Political borders dividing the map into distinct territories\n`
  }

  // Style suffix
  prompt += `\nStyle: High detail, fantasy cartography, labeled with place names in an elegant serif font. `
  prompt += `Include a compass rose and decorative border elements. `
  prompt += `The overall tone should match the ${material} material aesthetic.`

  // Count unnamed markers
  const unnamed = markers.filter(m => !m.name && !m.noNameNeeded && m.type !== 'borders' && !m.regionId)
  if (unnamed.length > 0) {
    const types = [...new Set(unnamed.map(m => m.type))]
    const typeCounts = types.map(t => {
      const def = MARKER_DEFINITIONS.find(d => d.type === t)
      return `${unnamed.filter(m => m.type === t).length} unnamed ${def?.type || t} markers`
    })
    prompt += `\n\nNote: There are also ${typeCounts.join(', ')} that need placement on the map.`
  }

  return prompt
}
