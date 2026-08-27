import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { Feather, Plus, FolderOpen, MoreVertical, Trash2 } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'

export default function ProjectsPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { projects, loading, fetchProjects, createProject, moveToTrash } = useProjectStore()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    const project = await createProject(newName.trim(), newDescription.trim() || undefined)
    if (project) {
      setShowCreateDialog(false)
      setNewName('')
      setNewDescription('')
      navigate(`/projects/${project.id}`)
    }
  }

  const handleDelete = async (id: string) => {
    await moveToTrash(id)
    setMenuOpenId(null)
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-1">
        <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">{t('projects.title')}</h2>
        <Button onClick={() => setShowCreateDialog(true)} className="w-full sm:w-auto">
          <Plus className="h-4 w-4" />
          {t('projects.create')}
        </Button>
      </div>
      <div className="lit-rule mb-6" />

      <Link
        to="/quills"
        className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 rounded-xl border border-primary/20 bg-primary-soft/40 p-5 hover:border-primary/40 hover:bg-primary-soft/70 transition-colors"
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className="rounded-lg bg-primary-soft p-3 text-primary shrink-0">
            <Feather className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-semibold">{t('quills.storeTitle')}</h3>
            <p className="text-sm text-muted-foreground">{t('quills.projectsCardDescription')}</p>
          </div>
        </div>
        <Button size="sm" className="shrink-0 w-full sm:w-auto">
          {t('quills.openStore')}
        </Button>
      </Link>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">{t('common.loading')}</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12">
          <FolderOpen className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-muted-foreground">{t('projects.empty')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="p-5 hover:shadow-md transition-shadow relative group"
            >
              <div
                className="cursor-pointer"
                onClick={() => navigate(`/projects/${project.id}`)}
              >
                <h3 className="font-display font-semibold text-lg mb-1">{project.name}</h3>
                {project.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {project.description}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-3">
                  {new Date(project.updated_at).toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US')}
                </p>
              </div>

              <div className="absolute top-3 end-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpenId(menuOpenId === project.id ? null : project.id)
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded hover:bg-accent opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                {menuOpenId === project.id && (
                  <div className="absolute end-0 top-8 bg-card border border-border rounded-md shadow-lg py-1 z-10 min-w-[140px]">
                    <button
                      onClick={() => handleDelete(project.id)}
                      className="w-full px-3 py-2 text-sm text-start hover:bg-accent flex items-center gap-2 text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t('common.delete')}
                    </button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Project Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-semibold mb-4">{t('projects.create')}</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label htmlFor="project-name" className="block text-sm font-semibold mb-1">
                  {t('projects.title')}
                </label>
                <Input
                  id="project-name"
                  name="project-name"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t('ui.projects.namePlaceholder')}
                  autoFocus
                  required
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="project-description" className="block text-sm font-semibold mb-1">
                  {t('projects.description')}
                </label>
                <textarea
                  id="project-description"
                  name="project-description"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring resize-none"
                  rows={3}
                  placeholder={t('ui.projects.descriptionPlaceholder')}
                  autoComplete="off"
                />
              </div>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="secondary" onClick={() => setShowCreateDialog(false)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit">
                  {t('common.create')}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
