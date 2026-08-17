import { useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useMapStore } from '@/stores/mapStore'
import CanvasEditor from '@/components/editor/CanvasEditor'
import MarkerPalette from '@/components/editor/MarkerPalette'
import EditorToolbar from '@/components/editor/EditorToolbar'
import NamingPanel from '@/components/editor/NamingPanel'
import PromptPanel from '@/components/editor/PromptPanel'
import UploadPanel from '@/components/editor/UploadPanel'

export default function MapEditorPage() {
  const { mapId } = useParams<{ mapId: string }>()
  const { loadMap, saveCanvas, isDirty } = useMapStore()
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (mapId) {
      loadMap(mapId)
    }
  }, [mapId, loadMap])

  // Auto-save with debounce
  useEffect(() => {
    if (isDirty) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        saveCanvas()
      }, 2000)
    }
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [isDirty, saveCanvas])

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const { undo, redo, removeMarker, selectedMarkerId } = useMapStore.getState()

    if (e.ctrlKey && e.key === 'z') {
      e.preventDefault()
      undo()
    } else if (e.ctrlKey && e.key === 'y') {
      e.preventDefault()
      redo()
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedMarkerId) {
      e.preventDefault()
      removeMarker(selectedMarkerId)
    } else if (e.key === 'Escape') {
      useMapStore.getState().setActiveTool(null)
      useMapStore.getState().selectMarker(null)
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="h-[calc(100vh-57px)] flex flex-col">
      <EditorToolbar />
      <div className="flex-1 flex overflow-hidden">
        <MarkerPalette />
        <div className="flex-1 relative">
          <CanvasEditor />
        </div>
        <div className="w-72 border-s overflow-y-auto bg-card">
          <NamingPanel />
          <PromptPanel />
          <UploadPanel />
        </div>
      </div>
    </div>
  )
}
