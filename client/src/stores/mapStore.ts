import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { MapRecord, CanvasMarker, CanvasRegion, CanvasState, MarkerType } from '@/lib/types'

interface HistoryEntry {
  markers: CanvasMarker[]
  regions: CanvasRegion[]
}

interface MapState {
  currentMap: MapRecord | null
  markers: CanvasMarker[]
  regions: CanvasRegion[]
  selectedMarkerId: string | null
  activeToolType: MarkerType | null
  activeShape: CanvasMarker['shape']
  scale: number
  viewportX: number
  viewportY: number
  isDirty: boolean

  // History for undo/redo
  history: HistoryEntry[]
  historyIndex: number

  // Actions
  loadMap: (mapId: string) => Promise<void>
  saveCanvas: () => Promise<void>
  setScale: (scale: number) => void
  setViewport: (x: number, y: number) => void
  setActiveTool: (type: MarkerType | null) => void
  setActiveShape: (shape: CanvasMarker['shape']) => void
  selectMarker: (id: string | null) => void
  setFinalImageUrl: (url: string) => void

  // Marker operations
  addMarker: (marker: CanvasMarker) => void
  updateMarker: (id: string, updates: Partial<CanvasMarker>) => void
  removeMarker: (id: string) => void
  moveMarker: (id: string, x: number, y: number) => void

  // Region operations
  addRegion: (region: CanvasRegion) => void
  updateRegion: (id: string, updates: Partial<CanvasRegion>) => void
  removeRegion: (id: string) => void

  // Clear all
  clearAll: () => void

  // History
  undo: () => void
  redo: () => void
  pushHistory: () => void
}

export const useMapStore = create<MapState>((set, get) => ({
  currentMap: null,
  markers: [],
  regions: [],
  selectedMarkerId: null,
  activeToolType: null,
  activeShape: 'circle',
  scale: 1,
  viewportX: 0,
  viewportY: 0,
  isDirty: false,
  history: [],
  historyIndex: -1,

  loadMap: async (mapId) => {
    const { data } = await supabase
      .from('maps')
      .select('*')
      .eq('id', mapId)
      .single()

    if (data) {
      const map = data as MapRecord
      const canvasState = map.canvas_state || { markers: [], regions: [], viewportX: 0, viewportY: 0, scale: 1 }

      set({
        currentMap: map,
        markers: canvasState.markers || [],
        regions: canvasState.regions || [],
        viewportX: canvasState.viewportX || 0,
        viewportY: canvasState.viewportY || 0,
        scale: canvasState.scale || 1,
        isDirty: false,
        history: [{ markers: canvasState.markers || [], regions: canvasState.regions || [] }],
        historyIndex: 0,
      })
    }
  },

  saveCanvas: async () => {
    const { currentMap, markers, regions, viewportX, viewportY, scale } = get()
    if (!currentMap) return

    const canvasState: CanvasState = { markers, regions, viewportX, viewportY, scale }

    await supabase
      .from('maps')
      .update({ canvas_state: canvasState })
      .eq('id', currentMap.id)

    set({ isDirty: false })
  },

  setScale: (scale) => set({ scale }),
  setViewport: (x, y) => set({ viewportX: x, viewportY: y }),
  setActiveTool: (type) => set({ activeToolType: type, selectedMarkerId: null }),
  setActiveShape: (shape) => set({ activeShape: shape }),
  selectMarker: (id) => set({ selectedMarkerId: id, activeToolType: null }),
  setFinalImageUrl: (url) => {
    const { currentMap } = get()
    if (currentMap) {
      set({ currentMap: { ...currentMap, final_image_url: url } })
    }
  },

  addMarker: (marker) => {
    get().pushHistory()
    set((state) => ({
      markers: [...state.markers, marker],
      isDirty: true,
    }))
  },

  updateMarker: (id, updates) => {
    set((state) => ({
      markers: state.markers.map(m => m.id === id ? { ...m, ...updates } : m),
      isDirty: true,
    }))
  },

  removeMarker: (id) => {
    get().pushHistory()
    set((state) => ({
      markers: state.markers.filter(m => m.id !== id),
      selectedMarkerId: state.selectedMarkerId === id ? null : state.selectedMarkerId,
      isDirty: true,
    }))
  },

  moveMarker: (id, x, y) => {
    set((state) => ({
      markers: state.markers.map(m => m.id === id ? { ...m, x, y } : m),
      isDirty: true,
    }))
  },

  addRegion: (region) => {
    get().pushHistory()
    set((state) => ({
      regions: [...state.regions, region],
      isDirty: true,
    }))
  },

  updateRegion: (id, updates) => {
    set((state) => ({
      regions: state.regions.map(r => r.id === id ? { ...r, ...updates } : r),
      isDirty: true,
    }))
  },

  removeRegion: (id) => {
    get().pushHistory()
    set((state) => ({
      regions: state.regions.filter(r => r.id !== id),
      markers: state.markers.map(m => m.regionId === id ? { ...m, regionId: null } : m),
      isDirty: true,
    }))
  },

  clearAll: () => {
    get().pushHistory()
    set({
      markers: [],
      regions: [],
      selectedMarkerId: null,
      activeToolType: null,
      isDirty: true,
    })
  },

  pushHistory: () => {
    const { markers, regions, history, historyIndex } = get()
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push({ markers: [...markers], regions: [...regions] })
    // Keep max 50 history entries
    if (newHistory.length > 50) newHistory.shift()
    set({ history: newHistory, historyIndex: newHistory.length - 1 })
  },

  undo: () => {
    const { historyIndex, history } = get()
    if (historyIndex <= 0) return
    const newIndex = historyIndex - 1
    const entry = history[newIndex]
    set({
      markers: [...entry.markers],
      regions: [...entry.regions],
      historyIndex: newIndex,
      isDirty: true,
    })
  },

  redo: () => {
    const { historyIndex, history } = get()
    if (historyIndex >= history.length - 1) return
    const newIndex = historyIndex + 1
    const entry = history[newIndex]
    set({
      markers: [...entry.markers],
      regions: [...entry.regions],
      historyIndex: newIndex,
      isDirty: true,
    })
  },
}))
