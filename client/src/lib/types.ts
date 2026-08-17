// ============================================
// Database Types - mirrors Supabase schema
// ============================================

export type MapMaterial = 'parchment' | 'paper' | 'aged' | 'leather' | 'stone'
export type MapType = 'world' | 'continent' | 'country' | 'city' | 'region'
export type MarkerType = 'water' | 'mountains' | 'city' | 'capital' | 'borders' | 'desert' | 'forest' | 'village' | 'custom'
export type RegionType = 'water' | 'mountains' | 'desert' | 'forest' | 'custom'
export type InferredShape = 'sea' | 'lake' | 'river' | 'mountain_range' | 'desert' | 'forest' | 'custom'
export type Language = 'en' | 'he'

export interface Profile {
  id: string
  display_name: string | null
  avatar_url: string | null
  preferred_language: Language
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  user_id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface MapRecord {
  id: string
  project_id: string
  user_id: string
  name: string
  material: MapMaterial
  map_type: MapType
  description: string | null
  canvas_state: CanvasState
  final_image_url: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Marker {
  id: string
  map_id: string
  marker_type: MarkerType
  x: number
  y: number
  name: string | null
  no_name_needed: boolean
  region_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface Region {
  id: string
  map_id: string
  name: string | null
  region_type: RegionType
  inferred_shape: InferredShape | null
  no_name_needed: boolean
  metadata: Record<string, unknown>
  created_at: string
}

export interface MapImage {
  id: string
  map_id: string
  storage_path: string
  file_name: string
  file_size: number | null
  mime_type: string | null
  is_current: boolean
  created_at: string
}

export interface PromptHistoryEntry {
  id: string
  map_id: string
  prompt_text: string
  canvas_snapshot: CanvasState | null
  created_at: string
}

// ============================================
// Canvas State Types
// ============================================

export interface CanvasMarker {
  id: string
  type: MarkerType
  x: number
  y: number
  name: string | null
  noNameNeeded: boolean
  regionId: string | null
  // Per-marker visual overrides (user-selected)
  shape?: 'circle' | 'dot' | 'triangle' | 'polygon' | 'line' | 'crown'
  color?: string
}

export interface CanvasRegion {
  id: string
  type: RegionType
  inferredShape: InferredShape | null
  name: string | null
  noNameNeeded: boolean
  markerIds: string[]
  boundaryPoints: { x: number; y: number }[]
}

export interface CanvasState {
  markers: CanvasMarker[]
  regions: CanvasRegion[]
  viewportX: number
  viewportY: number
  scale: number
  customMarkerDefs?: MarkerDefinition[]
}

// ============================================
// UI Types
// ============================================

export interface MarkerDefinition {
  type: MarkerType
  labelKey: string
  color: string
  shape: 'circle' | 'triangle' | 'crown' | 'dot' | 'polygon' | 'line'
  size: number
  isCustom?: boolean
}

export const MARKER_DEFINITIONS: MarkerDefinition[] = [
  { type: 'water', labelKey: 'editor.markers.water', color: '#3B82F6', shape: 'circle', size: 12 },
  { type: 'mountains', labelKey: 'editor.markers.mountains', color: '#6B7280', shape: 'triangle', size: 14 },
  { type: 'city', labelKey: 'editor.markers.city', color: '#1F2937', shape: 'dot', size: 10 },
  { type: 'capital', labelKey: 'editor.markers.capital', color: '#D97706', shape: 'crown', size: 16 },
  { type: 'borders', labelKey: 'editor.markers.borders', color: '#EF4444', shape: 'circle', size: 8 },
  { type: 'desert', labelKey: 'editor.markers.desert', color: '#EAB308', shape: 'circle', size: 12 },
  { type: 'forest', labelKey: 'editor.markers.forest', color: '#22C55E', shape: 'circle', size: 12 },
  { type: 'village', labelKey: 'editor.markers.village', color: '#92400E', shape: 'dot', size: 8 },
  { type: 'custom', labelKey: 'editor.markers.custom', color: '#9CA3AF', shape: 'circle', size: 12 },
]

export const MATERIALS: { value: MapMaterial; labelKey: string }[] = [
  { value: 'parchment', labelKey: 'maps.materials.parchment' },
  { value: 'paper', labelKey: 'maps.materials.paper' },
  { value: 'aged', labelKey: 'maps.materials.aged' },
  { value: 'leather', labelKey: 'maps.materials.leather' },
  { value: 'stone', labelKey: 'maps.materials.stone' },
]

export const MAP_TYPES: { value: MapType; labelKey: string }[] = [
  { value: 'world', labelKey: 'maps.types.world' },
  { value: 'continent', labelKey: 'maps.types.continent' },
  { value: 'country', labelKey: 'maps.types.country' },
  { value: 'city', labelKey: 'maps.types.city' },
  { value: 'region', labelKey: 'maps.types.region' },
]
