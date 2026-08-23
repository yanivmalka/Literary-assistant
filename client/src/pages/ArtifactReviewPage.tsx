import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ClipboardList } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import ProjectBreadcrumb from '@/components/ProjectBreadcrumb'
import ArtifactReviewCard from '@/components/artifacts/ArtifactReviewCard'
import { useArtifactStore } from '@/stores/artifactStore'
import { useDocumentStore } from '@/stores/documentStore'

export default function ArtifactReviewPage() {
  const { t } = useTranslation()
  const { projectId } = useParams<{ projectId: string }>()
  const { documents, fetchDocuments } = useDocumentStore()
  const {
    artifacts,
    sourcesByArtifactId,
    loading,
    error,
    fetchArtifacts,
    fetchArtifactSources,
  } = useArtifactStore()
  const [expandedArtifactId, setExpandedArtifactId] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId) return
    void fetchArtifacts(projectId)
    void fetchDocuments(projectId)
  }, [fetchArtifacts, fetchDocuments, projectId])

  const documentNames = useMemo(
    () => new Map(documents.map(document => [document.id, document.name])),
    [documents],
  )

  const handleToggle = async (artifactId: string) => {
    if (expandedArtifactId === artifactId) {
      setExpandedArtifactId(null)
      return
    }

    const artifact = artifacts.find(candidate => candidate.id === artifactId)
    if (!artifact) return
    setExpandedArtifactId(artifactId)
    if (!sourcesByArtifactId[artifactId]) {
      await fetchArtifactSources(artifact)
    }
  }

  if (!projectId) return null

  return (
    <div className="mx-auto max-w-4xl p-6">
      <ProjectBreadcrumb currentPage="documents" showTabs={false} />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <ClipboardList className="h-5 w-5" />
            {t('artifacts.title')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('artifacts.subtitle')}</p>
        </div>
        <Link
          to={`/projects/${projectId}/documents`}
          className="flex items-center gap-1.5 rounded border px-3 py-2 text-sm hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          {t('artifacts.backToDocuments')}
        </Link>
      </div>

      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        {t('artifacts.readOnlyNotice')}
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {t('artifacts.loadError')}: {error}
        </div>
      ) : artifacts.length === 0 ? (
        <div className="rounded-lg border bg-muted/20 p-8 text-center">
          <p className="text-sm text-muted-foreground">{t('artifacts.empty')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('artifacts.emptyDescription')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {artifacts.map(artifact => (
            <ArtifactReviewCard
              key={artifact.id}
              artifact={artifact}
              documentName={documentNames.get(artifact.document_id)}
              expanded={expandedArtifactId === artifact.id}
              sources={sourcesByArtifactId[artifact.id]}
              onToggle={() => void handleToggle(artifact.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
