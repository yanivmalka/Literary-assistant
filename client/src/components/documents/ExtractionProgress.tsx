import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Brain, CheckCircle, XCircle, AlertTriangle, X, Loader2, Pause, Play } from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'

interface ExtractionProgressProps {
  documentId: string
}

export default function ExtractionProgress({ documentId }: ExtractionProgressProps) {
  const { t } = useTranslation()
  const [showCancelWarning, setShowCancelWarning] = useState(false)

  const {
    extractionDone,
    extractionCancelled,
    extractionError,
    extractionPausing,
    extractionDocumentId,
    extractionWarnings,
    extractionProgress,
    pausedExtractions,
    pauseExtraction,
    resumeExtraction,
    cancelExtraction,
    dismissExtractionStatus,
  } = useDocumentStore()

  useEffect(() => {
    if (!extractionDone) return

    const timeoutId = window.setTimeout(() => {
      dismissExtractionStatus()
    }, 5000)

    return () => window.clearTimeout(timeoutId)
  }, [extractionDone, dismissExtractionStatus])

  const pausedExtraction = pausedExtractions[documentId]
  const isActiveDocument = extractionDocumentId === documentId

  // Nothing to show for unrelated documents. A paused run remains visible
  // even while another, higher-priority document is being extracted.
  if (!isActiveDocument && !pausedExtraction) {
    return null
  }

  const progress = isActiveDocument ? extractionProgress : pausedExtraction?.progress ?? null
  const percentage = progress && progress.totalChunks > 0
    ? Math.round((progress.processedChunks / progress.totalChunks) * 100)
    : 0

  // Estimate remaining time: ~15s per batch (rate limit delay) + ~5s processing
  const estimatedMinutes = progress && progress.totalChunks > 0
    ? Math.max(1, Math.ceil(((progress.totalChunks - progress.processedChunks) / 2) * 20 / 60))
    : null

  const handleCancelClick = () => {
    setShowCancelWarning(true)
  }

  const handleConfirmCancel = () => {
    setShowCancelWarning(false)
    cancelExtraction()
  }

  const handleResume = () => {
    void resumeExtraction(documentId)
  }

  const handleDismiss = () => {
    setShowCancelWarning(false)
    dismissExtractionStatus()
  }

  if (pausedExtraction && !isActiveDocument) {
    return (
      <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-700">
            <Pause className="h-5 w-5" />
            <span className="text-sm font-medium">{t('documents.extraction.paused')}</span>
          </div>
        </div>
        <p className="text-xs text-amber-700 ps-7">
          {t('documents.extraction.pausedDescription')}
        </p>
        {progress && progress.totalChunks > 0 && (
          <p className="text-xs text-amber-700 ps-7">
            {t('documents.extraction.progress', {
              processed: progress.processedChunks,
              total: progress.totalChunks,
            })}
          </p>
        )}
        <button
          onClick={handleResume}
          className="flex items-center gap-1 text-xs px-3 py-1.5 text-green-700 border border-green-200 bg-green-50 hover:bg-green-100 rounded transition-colors"
        >
          <Play className="h-3.5 w-3.5" />
          {t('documents.extraction.resumeButton')}
        </button>
      </div>
    )
  }

  // Completed with warnings state
  if (extractionDone && extractionWarnings.length > 0) {
    const hasSafetySkips = extractionWarnings.some((warning) => warning.reason === 'safety_block')
    const hasTransientSkips = extractionWarnings.some((warning) => warning.reason === 'transient_failure')

    return (
      <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm font-medium">{t('documents.extraction.completedWithWarnings')}</span>
          </div>
        </div>
        {progress && (
          <p className="text-xs text-amber-700 ps-7">
            {t('documents.extraction.completedWithWarningsSummary', {
              entities: progress.entitiesSaved,
              events: progress.eventsSaved,
              chunks: progress.skippedChunks,
            })}
          </p>
        )}
        <div className="space-y-1 ps-7 text-xs text-amber-700">
          {hasSafetySkips && <p>{t('documents.extraction.safetySkipped')}</p>}
          {hasTransientSkips && <p>{t('documents.extraction.transientSkipped')}</p>}
        </div>
      </div>
    )
  }

  // Completed state
  if (extractionDone) {
    return (
      <div className="border border-green-200 bg-green-50 rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle className="h-5 w-5" />
            <span className="text-sm font-medium">{t('documents.extraction.completed')}</span>
          </div>
        </div>
        {progress && (
          <p className="text-xs text-green-600 ps-7">
            {t('documents.extraction.completedSummary', {
              entities: progress.entitiesSaved,
              events: progress.eventsSaved,
            })}
          </p>
        )}
      </div>
    )
  }

  // Cancelled state
  if (extractionCancelled) {
    return (
      <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm font-medium">{t('documents.extraction.cancelled')}</span>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 text-amber-600 hover:text-amber-800 rounded transition-colors"
            title={t('documents.extraction.dismiss')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-amber-600 ps-7">
          {t('documents.extraction.cancelledDescription')}
        </p>
      </div>
    )
  }

  // Error state
  if (extractionError) {
    return (
      <div className="border border-red-200 bg-red-50 rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-700">
            <XCircle className="h-5 w-5" />
            <span className="text-sm font-medium">{t('documents.extraction.error')}</span>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 text-red-600 hover:text-red-800 rounded transition-colors"
            title={t('documents.extraction.dismiss')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-red-600 ps-7">
          {t(extractionError, { defaultValue: t('ui.documents.extractionError') })}
        </p>
      </div>
    )
  }

  // In progress state
  return (
    <div className="extraction-progress-processing border border-blue-200 bg-blue-50 rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-blue-700">
          <Brain className="h-5 w-5" />
          <span className="text-sm font-medium">{t('documents.extraction.inProgress')}</span>
        </div>
        <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
      </div>

      {/* Progress bar */}
      {progress && progress.totalChunks > 0 && (
        <div className="space-y-1.5">
          <div className="w-full h-2.5 bg-blue-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-blue-600">
            <span>
              {t('documents.extraction.progress', {
                processed: progress.processedChunks,
                total: progress.totalChunks,
              })}
            </span>
            <span>{percentage}%</span>
          </div>
        </div>
      )}

      {/* Stats */}
      {progress && (progress.entitiesSaved > 0 || progress.eventsSaved > 0) && (
        <div className="flex gap-3 text-xs text-blue-600 ps-0.5">
          {progress.entitiesSaved > 0 && (
            <span>{t('documents.extraction.entitiesFound', { count: progress.entitiesSaved })}</span>
          )}
          {progress.eventsSaved > 0 && (
            <span>{t('documents.extraction.eventsFound', { count: progress.eventsSaved })}</span>
          )}
        </div>
      )}

      {/* Estimated time */}
      {estimatedMinutes && estimatedMinutes > 0 && percentage < 90 && (
        <p className="text-xs text-blue-500 ps-0.5">
          {t('documents.extraction.estimatedTime', { minutes: estimatedMinutes })}
        </p>
      )}

      {/* Pause and cancel controls */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={pauseExtraction}
          disabled={extractionPausing}
          className="flex items-center gap-1 text-xs px-3 py-1.5 text-amber-700 border border-amber-200 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 rounded transition-colors"
        >
          <Pause className="h-3.5 w-3.5" />
          {extractionPausing
            ? t('documents.extraction.pausing')
            : t('documents.extraction.pauseButton')}
        </button>

        {!showCancelWarning ? (
          <button
            onClick={handleCancelClick}
            className="text-xs px-3 py-1.5 text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 rounded transition-colors"
          >
            {t('documents.extraction.cancelButton')}
          </button>
        ) : (
          <div className="basis-full p-3 bg-amber-50 border border-amber-200 rounded-md space-y-2">
            <p className="text-xs text-amber-700">
              {t('documents.extraction.cancelWarning')}
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleConfirmCancel}
                className="text-xs px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
              >
                {t('common.confirm')}
              </button>
              <button
                onClick={() => setShowCancelWarning(false)}
                className="text-xs px-3 py-1 border border-gray-300 rounded hover:bg-gray-100 transition-colors"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
