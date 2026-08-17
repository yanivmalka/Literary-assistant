// ============================================
// Database Types - mirrors Supabase schema
// ============================================

export type MapMaterial = 'parchment' | 'paper' | 'aged' | 'leather' | 'stone'
export type MapType = 'world' | 'continent' | 'country'
export type MarkerType = 'water' | 'mountains' | 'highMountains' | 'city' | 'capital' | 'borders' | 'desert' | 'forest' | 'village' | 'ice' | 'steppe' | 'swamp' | 'custom'
export type RegionType = 'water' | 'mountains' | 'desert' | 'forest' | 'ice' | 'steppe' | 'swamp' | 'custom'
export type InferredShape = 'sea' | 'lake' | 'river' | 'mountain_range' | 'desert' | 'forest' | 'custom'
export type Language = 'en' | 'he'
export type MarkerShape = 'circle' | 'dot' | 'triangle' | 'polygon' | 'line' | 'crown' | 'square'

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
  shape?: MarkerShape
  color?: string
  strokeColor?: string
  size?: number
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
  strokeColor?: string
  shape: MarkerShape
  size: number
  isCustom?: boolean
  hasShapeMenu?: boolean // markers that allow shape selection
  resizable?: boolean // markers that allow size change
  fixedShape?: boolean // markers with no shape menu
}

// Markers WITH shape submenu (terrain types)
// Markers WITHOUT shape menu have fixedShape: true
export const MARKER_DEFINITIONS: MarkerDefinition[] = [
  // --- Terrain markers with shape menu ---
  { type: 'water', labelKey: 'editor.markers.water', color: '#3B82F6', shape: 'circle', size: 12, hasShapeMenu: true, resizable: true },
  { type: 'desert', labelKey: 'editor.markers.desert', color: '#EAB308', shape: 'circle', size: 12, hasShapeMenu: true, resizable: true },
  { type: 'ice', labelKey: 'editor.markers.ice', color: '#FFFFFF', strokeColor: '#7DD3FC', shape: 'circle', size: 12, hasShapeMenu: true, resizable: true },
  { type: 'forest', labelKey: 'editor.markers.forest', color: '#22C55E', shape: 'circle', size: 12, hasShapeMenu: true, resizable: true },
  { type: 'steppe', labelKey: 'editor.markers.steppe', color: '#BBF7D0', shape: 'square', size: 12, hasShapeMenu: true, resizable: true },
  { type: 'swamp', labelKey: 'editor.markers.swamp', color: '#92400E', shape: 'circle', size: 12, hasShapeMenu: true, resizable: true },
  // --- Fixed-shape markers ---
  { type: 'mountains', labelKey: 'editor.markers.mountains', color: '#6B7280', shape: 'triangle', size: 14, fixedShape: true, resizable: true },
  { type: 'highMountains', labelKey: 'editor.markers.highMountains', color: '#FFFFFF', strokeColor: '#6B7280', shape: 'triangle', size: 16, fixedShape: true, resizable: true },
  { type: 'capital', labelKey: 'editor.markers.capital', color: '#D97706', shape: 'crown', size: 16, fixedShape: true, resizable: false },
  { type: 'city', labelKey: 'editor.markers.city', color: '#1F2937', shape: 'dot', size: 10, fixedShape: true, resizable: false },
  { type: 'village', labelKey: 'editor.markers.village', color: '#166534', shape: 'dot', size: 8, fixedShape: true, resizable: false },
  { type: 'borders', labelKey: 'editor.markers.borders', color: '#EF4444', shape: 'line', size: 8, fixedShape: true, resizable: false },
]

export const MATERIALS: { value: MapMaterial; labelKey: string; bgColor: string; textColor: string }[] = [
  { value: 'parchment', labelKey: 'maps.materials.parchment', bgColor: '#F5E6D3', textColor: '#5C3D1E' },
  { value: 'paper', labelKey: 'maps.materials.paper', bgColor: '#FFFFFF', textColor: '#1F2937' },
  { value: 'aged', labelKey: 'maps.materials.aged', bgColor: '#E8D5A3', textColor: '#6B4E1B' },
  { value: 'leather', labelKey: 'maps.materials.leather', bgColor: '#4A2C17', textColor: '#F5E6D3' },
  { value: 'stone', labelKey: 'maps.materials.stone', bgColor: '#9CA3AF', textColor: '#1F2937' },
]

export const MAP_TYPES: { value: MapType; labelKey: string }[] = [
  { value: 'world', labelKey: 'maps.types.world' },
  { value: 'continent', labelKey: 'maps.types.continent' },
  { value: 'country', labelKey: 'maps.types.country' },
]
