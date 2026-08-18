import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'
import DocumentUploader from '@/components/documents/DocumentUploader'
import DocumentList from '@/components/documents/DocumentList'

export default function DocumentsPage() {
  const { t } = useTranslation()
  const { projectId } = useParams<{ projectId: string }>()
  const { documents, loading, fetchDocuments, startPolling, stopPolling } = useDocumentStore()

  useEffect(() => {
    if (projectId) {
      fetchDocuments(projectId)
    }
  }, [projectId, fetchDocuments])

  // Poll while any document is processing
  useEffect(() => {
    if (!projectId) return

    const hasProcessing = documents.some(d => {
      const status = d.latest_version?.status
      if (!status) return false
      // Active processing states
      if (['uploaded', 'extracting', 'extracted', 'chunking', 'chunked', 'indexing', 'analyzing'].includes(status)) {
        // Check if stuck: if processing started more than 120s ago, consider it failed
        const startedAt = d.latest_version?.processing_started_at
        if (startedAt) {
          const elapsed = Date.now() - new Date(startedAt).getTime()
          if (elapsed > 120000) return false // stop polling — it's stuck
        }
        return true
      }
      return false
    })

    if (hasProcessing) {
      startPolling(projectId)
    } else {
      stopPolling()
    }

    return () => stopPolling()
  }, [documents, projectId, startPolling, stopPolling])

  if (!projectId) return null

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {t('documents.title')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('documents.subtitle')}
        </p>
      </div>

      {/* Upload section */}
      <div className="mb-8">
        <DocumentUploader
          projectId={projectId}
          onUploadComplete={() => fetchDocuments(projectId)}
        />
      </div>

      {/* Document list */}
      {loading && documents.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">{t('common.loading')}</p>
      ) : (
        <DocumentList projectId={projectId} />
      )}
    </div>
  )
}
