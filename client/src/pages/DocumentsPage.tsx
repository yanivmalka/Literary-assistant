import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, Link } from 'react-router-dom'
import { FileText, ClipboardList } from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'
import DocumentUploader from '@/components/documents/DocumentUploader'
import DocumentList from '@/components/documents/DocumentList'
import ProjectBreadcrumb from '@/components/ProjectBreadcrumb'

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
      if (['uploaded', 'extracting', 'extracted', 'chunking', 'chunked', 'indexing', 'indexed', 'analyzing'].includes(status)) {
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
      <ProjectBreadcrumb currentPage="documents" showTabs={false} />

      <div className="mb-6">
        <h2 className="font-display text-xl font-semibold tracking-tight flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {t('documents.title')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('documents.subtitle')}
        </p>
        <div className="lit-rule mt-4 mb-4" />
        <Link
          to={`/projects/${projectId}/artifacts`}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
        >
          <ClipboardList className="h-4 w-4" />
          {t('artifacts.openReview')}
        </Link>
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
