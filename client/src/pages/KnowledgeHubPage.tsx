import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Users, MapPin, Calendar, ArrowLeft } from 'lucide-react'
import { useEntityStore } from '@/stores/entityStore'
import { useBranchStore } from '@/stores/branchStore'
import CharactersHub from '@/components/knowledge/CharactersHub'
import LocationsHub from '@/components/knowledge/LocationsHub'
import TimelineHub from '@/components/knowledge/TimelineHub'
import {
  EXTRACTION_MODEL_PROFILE_CHANGED_EVENT,
  getStoredExtractionModelProfile,
  type ExtractionModelProfile,
} from '@/lib/extractionModels'

type TabType = 'characters' | 'locations' | 'timeline'

const isTabType = (value: string | null): value is TabType =>
  value === 'characters' || value === 'locations' || value === 'timeline'

export default function KnowledgeHubPage() {
  const { t } = useTranslation()
  const { projectId } = useParams<{ projectId: string }>()
  const navigateToProject = useNavigate()
  const [searchParams] = useSearchParams()

  const { entities, fetchEntities } = useEntityStore()
  const { fetchCurrentBranch } = useBranchStore()
  const [modelProfile, setModelProfile] = useState<ExtractionModelProfile>(
    getStoredExtractionModelProfile,
  )
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const requestedTab = searchParams.get('tab')
    return isTabType(requestedTab) ? requestedTab : 'characters'
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const requestedTab = searchParams.get('tab')
    setActiveTab(isTabType(requestedTab) ? requestedTab : 'characters')
  }, [searchParams])

  useEffect(() => {
    const syncModelProfile = () => setModelProfile(getStoredExtractionModelProfile())
    window.addEventListener(EXTRACTION_MODEL_PROFILE_CHANGED_EVENT, syncModelProfile)
    window.addEventListener('storage', syncModelProfile)
    return () => {
      window.removeEventListener(EXTRACTION_MODEL_PROFILE_CHANGED_EVENT, syncModelProfile)
      window.removeEventListener('storage', syncModelProfile)
    }
  }, [])

  useEffect(() => {
    if (projectId) {
      setIsLoading(true)
      Promise.all([
        fetchEntities(projectId, undefined, modelProfile),
        fetchCurrentBranch(projectId, modelProfile),
      ]).finally(() => setIsLoading(false))
    }
  }, [projectId, modelProfile, fetchEntities, fetchCurrentBranch])

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
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3 sm:gap-4">
          <button
            onClick={() => navigateToProject(`/projects/${projectId}`)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md hover:bg-accent transition-colors"
          >
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </button>
          <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">{t('knowledge.title')}</h1>
        </div>

        {/* Tab Navigation */}
        <nav className="flex gap-1 mb-8 p-1 rounded-lg bg-muted w-full sm:w-fit overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex shrink-0 items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-md transition-colors ${
                activeTab === tab.id
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
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
            {activeTab === 'characters' && (
              <CharactersHub projectId={projectId} entities={entities} modelProfile={modelProfile} />
            )}
            {activeTab === 'locations' && (
              <LocationsHub projectId={projectId} entities={entities} modelProfile={modelProfile} />
            )}
            {activeTab === 'timeline' && <TimelineHub projectId={projectId} />}
          </>
        )}
      </div>
    </div>
  )
}
