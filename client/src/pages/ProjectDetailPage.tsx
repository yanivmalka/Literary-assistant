import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Plus, Map, ArrowLeft, Users, MapPin, Calendar, MessageSquare, AlertTriangle, GitBranch } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useEntityStore } from '@/stores/entityStore'
import { getProjectEvents } from '@/lib/eventService'
import KnowledgeOverview from '@/components/knowledge/KnowledgeOverview'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

export default function ProjectDetailPage() {
  const { t } = useTranslation()
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { currentProject, projectMaps, fetchProject, fetchProjectMaps } = useProjectStore()
  const { documents, fetchDocuments } = useDocumentStore()
  const { entities, fetchEntities } = useEntityStore()
  const [timelineEventCount, setTimelineEventCount] = useState(0)

  useEffect(() => {
    if (projectId) {
      fetchProject(projectId)
      fetchProjectMaps(projectId)
      fetchDocuments(projectId)
      fetchEntities(projectId)
      getProjectEvents(projectId)
        .then(events => setTimelineEventCount(events.length))
        .catch(() => setTimelineEventCount(0))
    }
  }, [projectId, fetchProject, fetchProjectMaps, fetchDocuments, fetchEntities])

  if (!currentProject) {
    return (
      <div className="text-center py-12 text-muted-foreground">{t('common.loading')}</div>
    )
  }

  const hasReadyDocument = documents.some(d =>
    d.latest_version && ['ready', 'skipped_no_provider', 'indexed'].includes(d.latest_version.status)
  )

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/projects')}
          className="p-2 rounded-md hover:bg-accent transition-colors"
        >
          <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
        </button>
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">{currentProject.name}</h2>
          {currentProject.description && (
            <p className="text-muted-foreground mt-1">{currentProject.description}</p>
          )}
        </div>
      </div>

      {/* Sub-navigation */}
      <nav className="flex flex-wrap gap-2 mb-8 border-b border-border pb-3">
        <Link
          to={`/projects/${projectId}/qa`}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${hasReadyDocument ? 'text-muted-foreground hover:text-foreground hover:bg-accent' : 'opacity-50 pointer-events-none'}`}
        >
          <MessageSquare className="h-4 w-4" />
          {t('qa.title')}
        </Link>
        <Link
          to={`/projects/${projectId}/contradictions`}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${hasReadyDocument ? 'text-muted-foreground hover:text-foreground hover:bg-accent' : 'opacity-50 pointer-events-none'}`}
        >
          <AlertTriangle className="h-4 w-4" />
          {t('contradictions.title')}
        </Link>
        <Link
          to={`/projects/${projectId}/branches`}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
        >
          <GitBranch className="h-4 w-4" />
          {t('branch.title')}
        </Link>
      </nav>

      {/* Knowledge Overview */}
      <section className="mb-10">
        <h3 className="font-display text-xl font-semibold tracking-tight mb-4">{t('knowledge.title')}</h3>
        <KnowledgeOverview
          projectId={projectId!}
          documents={documents}
        />
      </section>

      {/* Maps Section — always available */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-display text-xl font-semibold tracking-tight flex items-center gap-2">
            <Map className="h-5 w-5" />
            {t('home.maps.title')}
          </h3>
          <Button size="sm" onClick={() => navigate(`/projects/${projectId}/maps/new`)}>
            <Plus className="h-4 w-4" />
            {t('maps.create')}
          </Button>
        </div>
        <div className="lit-rule mb-5" />

        {projectMaps.length === 0 ? (
          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
            <Map className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">{t('ui.maps.empty')}</p>
            <Button size="sm" onClick={() => navigate(`/projects/${projectId}/maps/new`)} className="inline-flex">
              <Plus className="h-4 w-4" />
              {t('maps.create')}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projectMaps.map((map) => (
              <Card
                key={map.id}
                onClick={() => navigate(`/projects/${projectId}/maps/${map.id}`)}
                className="p-4 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="aspect-video bg-muted rounded mb-3 flex items-center justify-center">
                  {map.final_image_url ? (
                    <img src={map.final_image_url} alt={map.name} className="w-full h-full object-cover rounded" />
                  ) : (
                    <Map className="h-8 w-8 text-muted-foreground/50" />
                  )}
                </div>
                <h4 className="font-display font-semibold">{map.name}</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {t(`maps.materials.${map.material}`)} &middot; {t(`maps.types.${map.map_type}`)}
                </p>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Knowledge categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link to={`/projects/${projectId}/knowledge?tab=characters`}>
          <Card className="p-5 transition-shadow hover:shadow-md cursor-pointer h-full">
            <h3 className="font-display font-semibold flex items-center gap-2 mb-2">
              <Users className="h-5 w-5 text-primary" />
              {t('entities.types.character')}
            </h3>
            <p className="text-sm text-muted-foreground">{t('home.characters.description')}</p>
            <p className="font-display text-lg font-bold mt-3">
              {entities.filter(e => e.entity_type === 'character').length}
            </p>
          </Card>
        </Link>

        <Link to={`/projects/${projectId}/knowledge?tab=locations`}>
          <Card className="p-5 transition-shadow hover:shadow-md cursor-pointer h-full">
            <h3 className="font-display font-semibold flex items-center gap-2 mb-2">
              <MapPin className="h-5 w-5 text-primary" />
              {t('entities.types.location')}
            </h3>
            <p className="text-sm text-muted-foreground">{t('home.environment.description')}</p>
            <p className="font-display text-lg font-bold mt-3">
              {entities.filter(e => e.entity_type === 'location').length}
            </p>
          </Card>
        </Link>

        <Link to={`/projects/${projectId}/knowledge?tab=timeline`}>
          <Card className="p-5 transition-shadow hover:shadow-md cursor-pointer h-full">
            <h3 className="font-display font-semibold flex items-center gap-2 mb-2">
              <Calendar className="h-5 w-5 text-primary" />
              {t('timeline.title')}
            </h3>
            <p className="text-sm text-muted-foreground">{t('timeline.eventsComingSoon')}</p>
            <p className="font-display text-lg font-bold mt-3">{timelineEventCount}</p>
          </Card>
        </Link>
      </div>
    </div>
  )
}
