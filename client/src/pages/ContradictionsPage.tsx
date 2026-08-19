import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { useContradictionStore } from '@/stores/contradictionStore'
import ContradictionCard from '@/components/contradictions/ContradictionCard'
import ProjectBreadcrumb from '@/components/ProjectBreadcrumb'

export default function ContradictionsPage() {
  const { t } = useTranslation()
  const { projectId } = useParams<{ projectId: string }>()
  const { contradictions, loading, fetchContradictions, resolveContradiction } = useContradictionStore()

  useEffect(() => {
    if (projectId) {
      fetchContradictions(projectId)
    }
  }, [projectId, fetchContradictions])

  if (!projectId) return null

  const openContradictions = contradictions.filter(c => c.status === 'open')
  const resolvedContradictions = contradictions.filter(c => c.status !== 'open')

  const handleResolve = (contradictionId: string, status: string) => {
    resolveContradiction(projectId, contradictionId, status)
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <ProjectBreadcrumb currentPage="contradictions" />

      <div className="mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          {t('contradictions.title')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{t('contradictions.subtitle')}</p>
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-8">{t('common.loading')}</p>
      ) : contradictions.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <AlertTriangle className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground">{t('contradictions.empty')}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {openContradictions.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-amber-700 mb-3">
                {t('contradictions.open')} ({openContradictions.length})
              </h3>
              <div className="space-y-3">
                {openContradictions.map(c => (
                  <ContradictionCard key={c.id} contradiction={c} onResolve={handleResolve} />
                ))}
              </div>
            </div>
          )}

          {resolvedContradictions.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                {t('contradictions.resolved')} ({resolvedContradictions.length})
              </h3>
              <div className="space-y-3">
                {resolvedContradictions.map(c => (
                  <ContradictionCard key={c.id} contradiction={c} onResolve={handleResolve} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
