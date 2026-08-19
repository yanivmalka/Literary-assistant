import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2, RotateCcw, XCircle } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'

export default function TrashPage() {
  const { t } = useTranslation()
  const { trashedProjects, loading, fetchTrashedProjects, restoreFromTrash, deletePermanently } = useProjectStore()

  useEffect(() => {
    fetchTrashedProjects()
  }, [fetchTrashedProjects])

  const getDaysRemaining = (deletedAt: string) => {
    const deleted = new Date(deletedAt)
    const expiry = new Date(deleted.getTime() + 30 * 24 * 60 * 60 * 1000)
    const now = new Date()
    const remaining = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return Math.max(0, remaining)
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-8">
        <Trash2 className="h-6 w-6 text-muted-foreground" />
        <h2 className="text-2xl font-bold">{t('projects.trash')}</h2>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">{t('common.loading')}</div>
      ) : trashedProjects.length === 0 ? (
        <div className="text-center py-12">
          <Trash2 className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground">{t('ui.projects.trashEmpty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {trashedProjects.map((project) => (
            <div
              key={project.id}
              className="border rounded-lg p-4 bg-card flex items-center justify-between"
            >
              <div>
                <h3 className="font-medium">{project.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('projects.daysRemaining', { days: getDaysRemaining(project.deleted_at!) })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => restoreFromTrash(project.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md hover:bg-accent transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t('projects.restore')}
                </button>
                <button
                  onClick={() => {
                    if (confirm(t('ui.projects.confirmPermanentDelete'))) {
                      deletePermanently(project.id)
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-destructive/30 text-destructive rounded-md hover:bg-destructive/10 transition-colors"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  {t('projects.deletePermanently')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
