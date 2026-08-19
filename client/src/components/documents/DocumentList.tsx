import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { FileText, Trash2, Brain, Loader2, AlertCircle } from 'lucide-react'
import { useDocumentStore, type Document } from '@/stores/documentStore'
import ProcessingStatus from './ProcessingStatus'
import ExtractionProgress from './ExtractionProgress'

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
  const {
    documents,
    deleteDocument,
    triggerEntityExtraction,
    extractionInProgress,
    extractionDocumentId,
    extractionError,
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

  const handleDelete = async (docId: string) => {
    if (window.confirm(t('documents.confirmDelete'))) {
      await deleteDocument(projectId, docId)
    }
  }

  const handleRetry = async (doc: Document) => {
    // Reprocess requires Express server. On static hosting, just refresh.
    if (!doc.latest_version) return
    window.location.reload()
  }

  const handleExtractKnowledge = async (doc: Document) => {
    if (!doc.latest_version || extractionInProgress) return
    console.log('[Knowledge] Manual extraction triggered for', doc.name)
    await triggerEntityExtraction(doc.latest_version.id, projectId, doc.id)
  }

  return (
    <div className="space-y-3">
      {/* Error alert if no active branch */}
      {extractionError === 'ui.documents.noBranchForExtraction' && (
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-medium text-amber-900 mb-1">{t('documents.noBranchTitle')}</h4>
            <p className="text-sm text-amber-800 mb-3">
              {t('documents.noBranchDescription')}
            </p>
            <Link
              to={`/projects/${projectId}/branches`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-sm rounded-md hover:bg-amber-700 transition-colors"
            >
              {t('documents.goToBranches')}
            </Link>
          </div>
        </div>
      )}

      {documents.map(doc => (
        <div key={doc.id} className="border rounded-lg p-4 bg-card">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              <div>
                <h4 className={`font-medium text-sm ${
                  doc.latest_version?.status === 'ready'
                    ? 'text-green-600'
                    : isProcessing(doc)
                      ? 'document-name-shimmer'
                      : ''
                }`}>{doc.name}</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {doc.file_type.toUpperCase()} • v{doc.version_count}
                  {doc.latest_version?.file_size && (
                    <> • {(doc.latest_version.file_size / 1024 / 1024).toFixed(1)} MB</>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {doc.latest_version?.status === 'ready' && (
                <button
                  onClick={() => handleExtractKnowledge(doc)}
                  disabled={extractionInProgress}
                  className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                    extractionInProgress
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-green-50 text-green-700 hover:bg-green-100'
                  }`}
                  title={t('ui.documents.extractKnowledgeTitle')}
                >
                  {extractionInProgress && extractionDocumentId === doc.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Brain className="h-3.5 w-3.5" />
                  )}
                  {t('ui.documents.extractKnowledge')}
                </button>
              )}
              <button
                onClick={() => handleDelete(doc.id)}
                className="p-1.5 text-muted-foreground hover:text-destructive rounded transition-colors"
                title={t('common.delete')}
              >
                <Trash2 className="h-4 w-4" />
              </button>
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
          {extractionDocumentId === doc.id && (
            <div className="mt-3 ps-8">
              <ExtractionProgress />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
