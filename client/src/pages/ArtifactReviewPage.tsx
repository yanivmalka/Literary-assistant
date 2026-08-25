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

      <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight">
          <ClipboardList className="h-5 w-5" />
          {t('artifacts.title')}
        </h2>
        <Link
          to={`/projects/${projectId}/documents`}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          {t('artifacts.backToDocuments')}
        </Link>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{t('artifacts.subtitle')}</p>
      <div className="lit-rule mb-5" />

      <div className="mb-4 rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
        {t('artifacts.readOnlyNotice')}
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {t('artifacts.loadError')}: {error}
        </div>
      ) : artifacts.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/20 p-8 text-center">
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
