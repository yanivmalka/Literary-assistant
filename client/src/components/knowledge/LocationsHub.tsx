import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GitBranch, Plus } from 'lucide-react'
import { useBranchStore } from '@/stores/branchStore'
import { useEntityStore } from '@/stores/entityStore'
import type { Entity } from '@/stores/entityStore'
import LocationTile from './LocationTile'
import LocationEditModal from './LocationEditModal'

interface LocationsHubProps {
  projectId: string
  entities: Entity[]
}

type VersionType = 'main' | 'branch'

export default function LocationsHub({ projectId }: LocationsHubProps) {
  const { t } = useTranslation()

  const { currentBranch } = useBranchStore()
  const { fetchEntities: fetchEntitiesStore, getMainOnlyEntities, getEffectiveBranchEntities } = useEntityStore()

  const [selectedVersion, setSelectedVersion] = useState<VersionType>('main')
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState<Entity | null>(null)

  // Get locations for selected version (Main or Branch)
  const mainLocations = getMainOnlyEntities({ type: 'location' })
  const branchLocations = getEffectiveBranchEntities({ type: 'location' })
  const locations = selectedVersion === 'main' ? mainLocations : branchLocations

  const handleEditLocation = (location: Entity) => {
    setSelectedLocation(location)
    setEditModalOpen(true)
  }

  const handleCreateNew = () => {
    setSelectedLocation(null)
    setEditModalOpen(true)
  }

  const handleCloseEditModal = () => {
    setEditModalOpen(false)
    setSelectedLocation(null)
  }

  return (
    <div>
      {/* Version Selection */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4">{t('branch.version')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Main Version Tile */}
          <button
            onClick={() => setSelectedVersion('main')}
            className={`border-2 rounded-lg p-6 text-left transition-all ${
              selectedVersion === 'main'
                ? 'border-primary bg-primary/5'
                : 'border-muted hover:border-muted-foreground/50'
            }`}
          >
            <div className="font-semibold text-lg mb-2">{t('branch.main')}</div>
            <p className="text-sm text-muted-foreground mb-4">{t('branch.mainDescription')}</p>
            <div className="text-2xl font-bold text-primary">
              {locations.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{t('entities.types.location')}</p>
          </button>

          {/* Branch Version Tile */}
          {currentBranch ? (
            <button
              onClick={() => setSelectedVersion('branch')}
              className={`border-2 rounded-lg p-6 text-left transition-all ${
                selectedVersion === 'branch'
                  ? 'border-primary bg-primary/5'
                  : 'border-muted hover:border-muted-foreground/50'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <GitBranch className="h-4 w-4" />
                <div className="font-semibold text-lg">{currentBranch.name}</div>
              </div>
              <p className="text-sm text-muted-foreground mb-4">{t('branch.branchDescription')}</p>
              <div className="text-2xl font-bold text-primary">
                {locations.length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{t('entities.types.location')}</p>
            </button>
          ) : (
            <div className="border-2 border-dashed rounded-lg p-6 opacity-50 cursor-not-allowed">
              <div className="flex items-center gap-2 mb-2">
                <GitBranch className="h-4 w-4" />
                <div className="font-semibold text-lg">{t('branch.noBranch')}</div>
              </div>
              <p className="text-sm text-muted-foreground">{t('branch.createBranchFirst')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Location Tiles */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {selectedVersion === 'main' ? t('branch.main') : currentBranch?.name}
          </h2>
          <button
            onClick={handleCreateNew}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t('entities.newLocation')}
          </button>
        </div>

        {locations.length === 0 ? (
          <div className="border-2 border-dashed rounded-lg p-12 text-center">
            <p className="text-muted-foreground">{t('entities.empty')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {locations.map(location => (
              <LocationTile
                key={location.id}
                location={location}
                onEdit={handleEditLocation}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <LocationEditModal
        isOpen={editModalOpen}
        location={selectedLocation}
        projectId={projectId}
        selectedVersion={selectedVersion}
        onClose={handleCloseEditModal}
        onLocationUpdated={() => {
          handleCloseEditModal()
          fetchEntitiesStore(projectId)
        }}
      />
    </div>
  )
}
