import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Trash2, Brain } from 'lucide-react'
import { useDocumentStore, type Document } from '@/stores/documentStore'
import ProcessingStatus from './ProcessingStatus'
import ExtractionProgress from './ExtractionProgress'
import { AlertDialog } from '@/components/ui/AlertDialog'
import {
  EXTRACTION_MODEL_PROFILES,
  getStoredExtractionModelProfile,
  setStoredExtractionModelProfile,
  type ExtractionModelProfile,
} from '@/lib/extractionModels'

interface DocumentListProps {
  projectId: string
}

const PROCESSING_STATUSES = new Set([
  'uploaded',
  'extracting',
  'extracted',
  'chunking',
  'chunked',
  'indexing',
  'indexed',
  'analyzing',
])

export default function DocumentList({ projectId }: DocumentListProps) {
  const { t } = useTranslation()
  const [selectedModelProfile, setSelectedModelProfile] = useState<ExtractionModelProfile>(
    getStoredExtractionModelProfile,
  )
  const [pendingDeleteDocId, setPendingDeleteDocId] = useState<string | null>(null)
  const {
    documents,
    deleteDocument,
    triggerEntityExtraction,
    resumeExtraction,
    extractionInProgress,
    extractionDocumentId,
    pausedExtractions,
  } = useDocumentStore()

  if (documents.length === 0) {
    return null
  }

  const isDocStuck = (doc: Document): boolean => {
    const v = doc.latest_version
    if (!v || !v.processing_started_at) return false
    const terminal = ['ready', 'error', 'skipped_no_provider']
    if (terminal.includes(v.status)) return false
    const elapsed = Date.now() - new Date(v.processing_started_at).getTime()
    return elapsed > 120000
  }

  const isProcessing = (doc: Document): boolean => {
    const status = doc.latest_version?.status
    return Boolean(status && PROCESSING_STATUSES.has(status) && !isDocStuck(doc))
  }

  const handleDelete = (docId: string) => {
    setPendingDeleteDocId(docId)
  }

  const handleConfirmDelete = async () => {
    if (!pendingDeleteDocId) return
    const docId = pendingDeleteDocId
    setPendingDeleteDocId(null)
    await deleteDocument(projectId, docId)
  }

  const handleRetry = async (doc: Document) => {
    // Reprocess requires Express server. On static hosting, just refresh.
    if (!doc.latest_version) return
    window.location.reload()
  }

  const handleExtractKnowledge = async (doc: Document) => {
    if (!doc.latest_version || extractionInProgress) return

    const paused = pausedExtractions[doc.id]
    if (paused) {
      await resumeExtraction(doc.id)
      return
    }

    console.log('[Knowledge] Manual extraction triggered for', doc.name)
    setStoredExtractionModelProfile(selectedModelProfile)
    await triggerEntityExtraction(
      doc.latest_version.id,
      projectId,
      doc.id,
      selectedModelProfile,
    )
  }

  return (
    <div className="space-y-3">
      <AlertDialog
        open={pendingDeleteDocId !== null}
        title={t('common.delete')}
        description={t('documents.confirmDelete')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDeleteDocId(null)}
        variant="destructive"
      />

      {documents.map(doc => {
        const isReady = doc.latest_version?.status === 'ready'
        const processing = isProcessing(doc)
        const hasPausedExtraction = Boolean(pausedExtractions[doc.id])

        return (
        <div
          key={doc.id}
          className={`border border-border rounded-lg p-4 bg-card ${processing ? 'document-tile-processing' : ''}`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <FileText className={`h-5 w-5 flex-shrink-0 ${isReady ? 'text-success' : 'text-muted-foreground'}`} />
              <div>
                <h4 className={`font-display font-semibold text-sm ${isReady ? 'text-success' : ''}`}>{doc.name}</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  <span className={isReady ? 'text-success' : ''}>{doc.file_type.toUpperCase()}</span>
                  {doc.latest_version?.file_size && (
                    <>
                      {' • '}
                      <span className={isReady ? 'text-success' : ''}>
                        {(doc.latest_version.file_size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {doc.latest_version?.status === 'ready' && (
                <>
                  <label htmlFor={`extraction-model-${doc.id}`} className="sr-only">
                    {t('ui.documents.modelProfile')}
                  </label>
                  <select
                    id={`extraction-model-${doc.id}`}
                    name={`extraction-model-${doc.id}`}
                    autoComplete="off"
                    value={selectedModelProfile}
                    onChange={event => {
                      const profile = event.target.value as ExtractionModelProfile
                      setSelectedModelProfile(profile)
                      setStoredExtractionModelProfile(profile)
                    }}
                    disabled={extractionInProgress || hasPausedExtraction}
                    className="max-w-36 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground disabled:opacity-50"
                    title={t('ui.documents.modelProfile')}
                  >
                    {EXTRACTION_MODEL_PROFILES.map(profile => (
                      <option key={profile} value={profile}>
                        {t(`ui.documents.modelProfiles.${profile}`)}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleExtractKnowledge(doc)}
                    disabled={extractionInProgress}
                    className={`flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md transition-colors ${
                      extractionInProgress
                        ? 'bg-muted text-muted-foreground cursor-not-allowed'
                        : 'bg-success-soft text-success hover:bg-success-soft/70'
                    }`}
                    title={hasPausedExtraction
                      ? t('documents.extraction.resumeButton')
                      : t('ui.documents.extractKnowledgeTitle')}
                  >
                    <Brain className="h-3.5 w-3.5" />
                    {hasPausedExtraction
                      ? t('documents.extraction.resumeButton')
                      : t('ui.documents.extractKnowledge')}
                  </button>
                </>
              )}
              {isReady && !extractionInProgress && (
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="relative z-20 p-1.5 text-destructive hover:opacity-80 rounded-md transition-opacity"
                  title={t('common.delete')}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Processing status / retry feedback */}
          {doc.latest_version && doc.latest_version.status !== 'ready' && !isProcessing(doc) && (
            <div className="mt-3 ps-8">
              <ProcessingStatus
                status={doc.latest_version.status}
                errorMessage={doc.latest_version.error_message}
                errorStage={doc.latest_version.error_stage}
                processingStartedAt={doc.latest_version.processing_started_at}
                onRetry={['error'].includes(doc.latest_version.status) || isDocStuck(doc)
                  ? () => handleRetry(doc)
                  : undefined}
              />
            </div>
          )}

          {/* Entity extraction progress */}
          {extractionDocumentId === doc.id || hasPausedExtraction ? (
            <div className="mt-3 ps-8">
              <ExtractionProgress documentId={doc.id} />
            </div>
          ) : null}
        </div>
        )
      })}
    </div>
  )
}
