import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Plus, Map, ArrowLeft, Users, TreePine, Sparkles } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'

export default function ProjectDetailPage() {
  const { t } = useTranslation()
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { currentProject, projectMaps, fetchProject, fetchProjectMaps } = useProjectStore()

  useEffect(() => {
    if (projectId) {
      fetchProject(projectId)
      fetchProjectMaps(projectId)
    }
  }, [projectId, fetchProject, fetchProjectMaps])

  if (!currentProject) {
    return (
      <div className="text-center py-12 text-muted-foreground">{t('common.loading')}</div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => navigate('/projects')}
          className="p-2 rounded-md hover:bg-accent transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-2xl font-bold">{currentProject.name}</h2>
          {currentProject.description && (
            <p className="text-muted-foreground mt-1">{currentProject.description}</p>
          )}
        </div>
      </div>

      {/* Maps Section */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Map className="h-5 w-5" />
            {t('home.maps.title')}
          </h3>
          <Link
            to={`/projects/${projectId}/maps/new`}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t('maps.create')}
          </Link>
        </div>

        {projectMaps.length === 0 ? (
          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <Map className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">No maps yet</p>
            <Link
              to={`/projects/${projectId}/maps/new`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              {t('maps.create')}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projectMaps.map((map) => (
              <div
                key={map.id}
                onClick={() => navigate(`/projects/${projectId}/maps/${map.id}`)}
                className="border rounded-lg p-4 bg-card hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="aspect-video bg-muted rounded mb-3 flex items-center justify-center">
                  {map.final_image_url ? (
                    <img src={map.final_image_url} alt={map.name} className="w-full h-full object-cover rounded" />
                  ) : (
                    <Map className="h-8 w-8 text-muted-foreground/50" />
                  )}
                </div>
                <h4 className="font-medium">{map.name}</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {t(`maps.materials.${map.material}`)} &middot; {t(`maps.types.${map.map_type}`)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Placeholder Sections */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <section className="border rounded-lg p-5 bg-muted/30 opacity-60">
          <h3 className="font-semibold flex items-center gap-2 mb-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            {t('home.characters.title')}
          </h3>
          <p className="text-sm text-muted-foreground">{t('home.characters.description')}</p>
          <span className="inline-block mt-3 text-xs bg-secondary px-2 py-1 rounded">
            {t('common.comingSoon')}
          </span>
        </section>

        <section className="border rounded-lg p-5 bg-muted/30 opacity-60">
          <h3 className="font-semibold flex items-center gap-2 mb-2">
            <TreePine className="h-5 w-5 text-muted-foreground" />
            {t('home.environment.title')}
          </h3>
          <p className="text-sm text-muted-foreground">{t('home.environment.description')}</p>
          <span className="inline-block mt-3 text-xs bg-secondary px-2 py-1 rounded">
            {t('common.comingSoon')}
          </span>
        </section>

        <section className="border rounded-lg p-5 bg-muted/30 opacity-60">
          <h3 className="font-semibold flex items-center gap-2 mb-2">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
            {t('home.magic.title')}
          </h3>
          <p className="text-sm text-muted-foreground">{t('home.magic.description')}</p>
          <span className="inline-block mt-3 text-xs bg-secondary px-2 py-1 rounded">
            {t('common.comingSoon')}
          </span>
        </section>
      </div>
    </div>
  )
}
