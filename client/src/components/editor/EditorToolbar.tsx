import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ZoomIn, ZoomOut, Maximize, RotateCcw, Undo2, Redo2, Save, Trash2, XCircle } from 'lucide-react'
import { useMapStore } from '@/stores/mapStore'

export default function EditorToolbar() {
  const { t } = useTranslation()
  const { currentMap, scale, setScale, setViewport, undo, redo, saveCanvas, isDirty, historyIndex, history, selectedMarkerId, removeMarker, clearAll, markers, regions } = useMapStore()
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const handleZoomIn = () => setScale(Math.min(scale * 1.2, 5))
  const handleZoomOut = () => setScale(Math.max(scale / 1.2, 0.1))
  const handleFitToScreen = () => {
    setScale(1)
    setViewport(0, 0)
  }
  const handleReset = () => {
    setScale(1)
    setViewport(0, 0)
  }

  const handleDeleteSelected = () => {
    if (selectedMarkerId) {
      removeMarker(selectedMarkerId)
    }
  }

  const handleClearAll = () => {
    setShowClearConfirm(true)
  }

  const confirmClear = () => {
    clearAll()
    setShowClearConfirm(false)
  }

  const hasContent = markers.length > 0 || regions.length > 0

  return (
    <>
      <div className="border-b bg-card px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">
            {currentMap?.name || 'Map Editor'}
          </span>
          {isDirty && (
            <span className="text-xs text-muted-foreground">(unsaved)</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={undo}
            disabled={historyIndex <= 0}
            className="p-1.5 rounded hover:bg-accent disabled:opacity-30 transition-colors"
            title={t('editor.toolbar.undo')}
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            className="p-1.5 rounded hover:bg-accent disabled:opacity-30 transition-colors"
            title={t('editor.toolbar.redo')}
          >
            <Redo2 className="h-4 w-4" />
          </button>

          <div className="w-px h-5 bg-border mx-2" />

          <button
            onClick={handleDeleteSelected}
            disabled={!selectedMarkerId}
            className="p-1.5 rounded hover:bg-accent disabled:opacity-30 transition-colors text-destructive"
            title={t('editor.toolbar.deleteSelected')}
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            onClick={handleClearAll}
            disabled={!hasContent}
            className="p-1.5 rounded hover:bg-accent disabled:opacity-30 transition-colors text-destructive"
            title={t('editor.toolbar.clearAll')}
          >
            <XCircle className="h-4 w-4" />
          </button>

          <div className="w-px h-5 bg-border mx-2" />

          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded hover:bg-accent transition-colors"
            title={t('editor.toolbar.zoomIn')}
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <span className="text-xs text-muted-foreground w-12 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded hover:bg-accent transition-colors"
            title={t('editor.toolbar.zoomOut')}
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={handleFitToScreen}
            className="p-1.5 rounded hover:bg-accent transition-colors"
            title={t('editor.toolbar.fitToScreen')}
          >
            <Maximize className="h-4 w-4" />
          </button>
          <button
            onClick={handleReset}
            className="p-1.5 rounded hover:bg-accent transition-colors"
            title={t('editor.toolbar.resetView')}
          >
            <RotateCcw className="h-4 w-4" />
          </button>

          <div className="w-px h-5 bg-border mx-2" />

          <button
            onClick={saveCanvas}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            <Save className="h-3.5 w-3.5" />
            {t('common.save')}
          </button>
        </div>
      </div>

      {/* Clear All Confirmation Dialog */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border rounded-lg p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-2">{t('editor.toolbar.clearAllTitle')}</h3>
            <p className="text-sm text-muted-foreground mb-4">{t('editor.toolbar.clearAllWarning')}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 border rounded-md hover:bg-accent transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={confirmClear}
                className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-colors"
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
