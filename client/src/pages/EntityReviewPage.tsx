import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom'
import { Users, MapPin, Sword, Sparkles, Shield, GitBranch, Plus } from 'lucide-react'
import { useEntityStore } from '@/stores/entityStore'
import EntityCard from '@/components/entities/EntityCard'
import MergeSuggestionComponent from '@/components/entities/MergeSuggestion'
import EntityModal from '@/components/entities/EntityModal'
import ProjectBreadcrumb from '@/components/ProjectBreadcrumb'
import { type EntityType } from '@/lib/entityTypes'

const TYPE_FILTERS = [
  { value: 'character', label: 'entities.types.character', icon: Users },
  { value: 'location', label: 'entities.types.location', icon: MapPin },
  { value: 'object', label: 'entities.types.object', icon: Sword },
  { value: 'ability', label: 'entities.types.ability', icon: Shield },
  { value: 'magic_ability', label: 'entities.types.magic_ability', icon: Sparkles },
]

export default function EntityReviewPage() {
  const { t } = useTranslation()
  const { projectId } = useParams<{ projectId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const {
    entities,
    mergeSuggestions,
    loading,
    fetchEntities,
    fetchMergeSuggestions,
    confirmEntity,
    dismissEntity,
    mergeEntities,
  } = useEntityStore()

  const [typeFilter, setTypeFilter] = useState(searchParams.get('type') || 'character')
  const [statusFilter, setStatusFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingEntity, setEditingEntity] = useState<ReturnType<typeof useEntityStore.getState>['entities'][0] | null>(null)

  const handleTypeFilter = (value: string) => {
    setTypeFilter(value)
    if (value) {
      setSearchParams({ type: value })
    } else {
      setSearchParams({})
    }
  }

  useEffect(() => {
    if (projectId) {
      fetchEntities(projectId, { type: typeFilter || undefined, status: statusFilter || undefined })
      fetchMergeSuggestions(projectId)
    }
  }, [projectId, typeFilter, statusFilter, fetchEntities, fetchMergeSuggestions])

  if (!projectId) return null

  const handleConfirm = (entityId: string) => {
    confirmEntity(projectId, entityId)
  }

  const handleDismiss = (entityId: string) => {
    dismissEntity(projectId, entityId)
  }

  const handleMerge = (entityAId: string, entityBId: string) => {
    mergeEntities(projectId, entityAId, entityBId)
  }

  const handleCreateNew = () => {
    setEditingEntity(null)
    setModalOpen(true)
  }

  const handleEditEntity = (entity: typeof entities[0]) => {
    navigate(`/projects/${projectId}/entities/${entity.id}`)
  }

  const handleModalSaved = () => {
    if (projectId) {
      fetchEntities(projectId, { type: typeFilter || undefined })
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <ProjectBreadcrumb currentPage="entities" showTabs={false} />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">
            {typeFilter ? t(`entities.types.${typeFilter}`) : t('entities.title')}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {typeFilter ? t('entities.subtitleByType', { type: t(`entities.types.${typeFilter}`) }) : t('entities.subtitle')}
          </p>
        </div>
        <button
          onClick={handleCreateNew}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t('entityModal.createNew')}
        </button>
      </div>

      {/* Merge suggestions */}
      {mergeSuggestions.length > 0 && (
        <div className="mb-6 space-y-2">
          <h3 className="text-sm font-semibold text-amber-700">{t('entities.mergeSuggestions')}</h3>
          {mergeSuggestions.slice(0, 5).map((suggestion, idx) => (
            <MergeSuggestionComponent
              key={idx}
              suggestion={suggestion}
              onMerge={handleMerge}
            />
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {TYPE_FILTERS.map(filter => (
          <button
            key={filter.value}
            onClick={() => handleTypeFilter(filter.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
              typeFilter === filter.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            <filter.icon className="h-3.5 w-3.5" />
            {t(filter.label)}
          </button>
        ))}
      </div>

      {/* Status filter + Branch link */}
      <div className="flex items-center gap-2 mb-4">
        {['pending', 'confirmed'].map(status => (
          <button
            key={status}
            onClick={() => setStatusFilter(statusFilter === status ? '' : status)}
            className={`text-xs px-2.5 py-1 rounded transition-colors ${
              statusFilter === status
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {t(`entities.status.${status}`)}
          </button>
        ))}
        <Link
          to={`/projects/${projectId}/branches`}
          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded text-muted-foreground hover:bg-muted transition-colors ms-auto"
        >
          <GitBranch className="h-3 w-3" />
          {t('branch.title')}
        </Link>
      </div>

      {/* Entity list */}
      {loading ? (
        <p className="text-center text-muted-foreground py-8">{t('common.loading')}</p>
      ) : entities.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <Users className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground">{t('entities.empty')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {entities.map(entity => (
            <EntityCard
              key={entity.id}
              entity={entity}
              onConfirm={handleConfirm}
              onDismiss={handleDismiss}
              onClick={() => handleEditEntity(entity)}
            />
          ))}
        </div>
      )}

      {/* Entity Modal */}
      <EntityModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        entityType={(typeFilter || 'character') as EntityType}
        projectId={projectId}
        entity={editingEntity}
        onSaved={handleModalSaved}
      />
    </div>
  )
}
