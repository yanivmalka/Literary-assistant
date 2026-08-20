import { useTranslation } from 'react-i18next'
import { FileText } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Document } from '@/stores/documentStore'

interface KnowledgeOverviewProps {
  projectId: string
  documents: Document[]
}

export default function KnowledgeOverview({ projectId, documents }: KnowledgeOverviewProps) {
  const { t } = useTranslation()

  const readyDocs = documents.filter(d =>
    d.latest_version && ['ready', 'skipped_no_provider', 'indexed'].includes(d.latest_version.status)
  )

  const hasDocuments = documents.length > 0

  return (
    <div className="space-y-4">
      {/* Documents summary */}
      <div className="grid grid-cols-1 gap-3">
        <Link
          to={`/projects/${projectId}/documents`}
          className="border rounded-lg p-3 hover:shadow-sm transition-shadow"
        >
          <div className="flex items-center gap-2 mb-1">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('knowledge.documents')}</span>
          </div>
          <p className="text-lg font-bold">{documents.length}</p>
          {readyDocs.length > 0 && (
            <p className="text-xs text-green-600">{readyDocs.length} {t('knowledge.ready')}</p>
          )}
        </Link>
      </div>

      {/* CTA if no documents */}
      {!hasDocuments && (
        <div className="border-2 border-dashed rounded-lg p-6 text-center">
          <FileText className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-3">{t('knowledge.uploadCta')}</p>
          <Link
            to={`/projects/${projectId}/documents`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
          >
            {t('knowledge.uploadButton')}
          </Link>
        </div>
      )}
    </div>
  )
}
