import { useTranslation } from 'react-i18next'
import { FileText, Trash2 } from 'lucide-react'
import { useDocumentStore, type Document } from '@/stores/documentStore'
import ProcessingStatus from './ProcessingStatus'

interface DocumentListProps {
  projectId: string
}

export default function DocumentList({ projectId }: DocumentListProps) {
  const { t } = useTranslation()
  const { documents, deleteDocument } = useDocumentStore()

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

  return (
    <div className="space-y-3">
      {documents.map(doc => (
        <div key={doc.id} className="border rounded-lg p-4 bg-card">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              <div>
                <h4 className="font-medium text-sm">{doc.name}</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {doc.file_type.toUpperCase()} • v{doc.version_count}
                  {doc.latest_version?.file_size && (
                    <> • {(doc.latest_version.file_size / 1024 / 1024).toFixed(1)} MB</>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => handleDelete(doc.id)}
                className="p-1.5 text-muted-foreground hover:text-destructive rounded transition-colors"
                title={t('common.delete')}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Processing status */}
          {doc.latest_version && (
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
        </div>
      ))}
    </div>
  )
}
