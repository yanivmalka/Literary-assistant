import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import { Users, MapPin, Calendar, ArrowLeft } from 'lucide-react'
import { useEntityStore } from '@/stores/entityStore'
import { useBranchStore } from '@/stores/branchStore'
import CharactersHub from '@/components/knowledge/CharactersHub'
import LocationsHub from '@/components/knowledge/LocationsHub'
import TimelineHub from '@/components/knowledge/TimelineHub'

type TabType = 'characters' | 'locations' | 'timeline'

export default function KnowledgeHubPage() {
  const { t } = useTranslation()
  const { projectId } = useParams<{ projectId: string }>()
  const navigateToProject = useNavigate()

  const { entities, fetchEntities } = useEntityStore()
  const { fetchCurrentBranch } = useBranchStore()
  const [activeTab, setActiveTab] = useState<TabType>('characters')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (projectId) {
      setIsLoading(true)
      Promise.all([
        fetchEntities(projectId),
        fetchCurrentBranch(projectId),
      ]).finally(() => setIsLoading(false))
    }
  }, [projectId, fetchEntities, fetchCurrentBranch])

  if (!projectId) {
    return <div className="text-center py-12">{t('common.loading')}</div>
  }

  const TABS: Array<{ id: TabType; label: string; icon: typeof Users }> = [
    { id: 'characters', label: t('entities.types.character'), icon: Users },
    { id: 'locations', label: t('entities.types.location'), icon: MapPin },
    { id: 'timeline', label: t('timeline.title'), icon: Calendar },
  ]

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-4">
          <button
            onClick={() => navigateToProject(`/projects/${projectId}`)}
            className="p-2 rounded-md hover:bg-accent transition-colors"
          >
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </button>
          <h1 className="text-2xl font-bold">{t('knowledge.title')}</h1>
        </div>

        {/* Tab Navigation */}
        <nav className="flex gap-2 mb-8 border-b pb-3">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            {t('common.loading')}
          </div>
        ) : (
          <>
            {activeTab === 'characters' && <CharactersHub projectId={projectId} entities={entities} />}
            {activeTab === 'locations' && <LocationsHub projectId={projectId} entities={entities} />}
            {activeTab === 'timeline' && <TimelineHub projectId={projectId} />}
          </>
        )}
      </div>
    </div>
  )
}
