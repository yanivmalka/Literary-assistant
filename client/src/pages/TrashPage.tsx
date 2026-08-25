import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2, RotateCcw, XCircle } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { toast } from '@/components/Toast'
import { Button } from '@/components/ui/Button'

export default function TrashPage() {
  const { t } = useTranslation()
  const {
    trashedProjects,
    loading,
    fetchTrashedProjects,
    restoreFromTrash,
    deletePermanently,
    emptyTrash,
  } = useProjectStore()
  const [emptyingTrash, setEmptyingTrash] = useState(false)

  useEffect(() => {
    fetchTrashedProjects()
  }, [fetchTrashedProjects])

  const handleEmptyTrash = async () => {
    if (trashedProjects.length === 0 || emptyingTrash) return
    if (!window.confirm(t('ui.projects.confirmEmptyTrash'))) return

    setEmptyingTrash(true)
    try {
      const result = await emptyTrash()
      if (!result.success) {
        toast('error', t('ui.projects.emptyTrashError'))
        return
      }

      await fetchTrashedProjects()
      toast('success', t('ui.projects.emptyTrashSuccess'))
    } finally {
      setEmptyingTrash(false)
    }
  }

  const getDaysRemaining = (deletedAt: string) => {
    const deleted = new Date(deletedAt)
    const expiry = new Date(deleted.getTime() + 30 * 24 * 60 * 60 * 1000)
    const now = new Date()
    const remaining = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return Math.max(0, remaining)
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between gap-4 mb-1">
        <div className="flex items-center gap-3">
          <Trash2 className="h-6 w-6 text-muted-foreground" />
          <h2 className="font-display text-2xl font-semibold tracking-tight">{t('projects.trash')}</h2>
        </div>
        {trashedProjects.length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleEmptyTrash}
            disabled={emptyingTrash}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {emptyingTrash ? t('ui.projects.emptyingTrash') : t('ui.projects.emptyTrash')}
          </Button>
        )}
      </div>
      <div className="lit-rule mb-6" />

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">{t('common.loading')}</div>
      ) : trashedProjects.length === 0 ? (
        <div className="text-center py-12">
          <Trash2 className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground">{t('ui.projects.trashEmpty')}</p>
        </div>
      ) : (
        <div className="divide-y divide-border border-t border-b border-border">
          {trashedProjects.map((project) => (
            <div
              key={project.id}
              className="flex items-center justify-between py-3.5"
            >
              <div>
                <h3 className="font-display font-semibold text-sm">{project.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('projects.daysRemaining', { days: getDaysRemaining(project.deleted_at!) })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => restoreFromTrash(project.id)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t('projects.restore')}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (confirm(t('ui.projects.confirmPermanentDelete'))) {
                      deletePermanently(project.id)
                    }
                  }}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  {t('projects.deletePermanently')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
