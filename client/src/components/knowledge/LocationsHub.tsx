import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import type { Entity } from '@/stores/entityStore'
import LocationTile from './LocationTile'

interface LocationsHubProps {
  projectId: string
  entities: Entity[]
}

export default function LocationsHub({ entities }: LocationsHubProps) {
  const { t } = useTranslation()

  const locations = entities.filter(e => e.entity_type === 'location')

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">{t('entities.types.location')}</h2>
        <button
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t('entities.newLocation')}
        </button>
      </div>

      {/* Location Tiles */}
      {locations.length === 0 ? (
        <div className="border-2 border-dashed rounded-lg p-12 text-center">
          <p className="text-muted-foreground">{t('entities.empty')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {locations.map(location => (
            <LocationTile key={location.id} location={location} />
          ))}
        </div>
      )}
    </div>
  )
}
