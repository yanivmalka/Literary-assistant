import { useTranslation } from 'react-i18next'
import { FileText, Users, AlertTriangle, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Document } from '@/stores/documentStore'
import type { Entity } from '@/stores/entityStore'
import type { Contradiction } from '@/stores/contradictionStore'

interface KnowledgeOverviewProps {
  projectId: string
  documents: Document[]
  entities: Entity[]
  contradictions: Contradiction[]
}

export default function KnowledgeOverview({ projectId, documents, entities, contradictions }: KnowledgeOverviewProps) {
  const { t } = useTranslation()

  const readyDocs = documents.filter(d =>
    d.latest_version && ['ready', 'skipped_no_provider', 'indexed'].includes(d.latest_version.status)
  )
  const confirmedEntities = entities.filter(e => e.status === 'confirmed')
  const pendingEntities = entities.filter(e => e.status === 'pending')
  const openContradictions = contradictions.filter(c => c.status === 'open')

  const hasDocuments = documents.length > 0
  const hasReadyDoc = readyDocs.length > 0

  return (
    <div className="space-y-4">
      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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

        <Link
          to={`/projects/${projectId}/entities`}
          className="border rounded-lg p-3 hover:shadow-sm transition-shadow"
        >
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('knowledge.entities')}</span>
          </div>
          <p className="text-lg font-bold">{confirmedEntities.length}</p>
          {pendingEntities.length > 0 && (
            <p className="text-xs text-amber-600">{pendingEntities.length} {t('knowledge.pending')}</p>
          )}
        </Link>

        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('knowledge.contradictions')}</span>
          </div>
          <p className="text-lg font-bold">{openContradictions.length}</p>
          {openContradictions.length > 0 && (
            <p className="text-xs text-amber-600">{t('knowledge.needsReview')}</p>
          )}
        </div>

        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Search className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('knowledge.search')}</span>
          </div>
          <p className="text-sm font-medium mt-1">
            {hasReadyDoc ? t('knowledge.searchReady') : t('knowledge.searchNotReady')}
          </p>
        </div>
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
