import { useTranslation } from 'react-i18next'
import { Edit3 } from 'lucide-react'
import type { Entity } from '@/stores/entityStore'

interface LocationTileProps {
  location: Entity
  onEdit?: (location: Entity) => void
}

function getField(entity: Entity, field: string): string | null {
  const sf = entity.structured_fields as Record<string, unknown> | undefined
  if (sf && sf[field] != null && sf[field] !== '') return String(sf[field])
  const attr = entity.attributes as Record<string, unknown> | undefined
  if (attr && attr[field] != null && attr[field] !== '') return String(attr[field])
  return null
}

export default function LocationTile({ location, onEdit }: LocationTileProps) {
  const { t } = useTranslation()

  const locationType = getField(location, 'location_type')
  const description = getField(location, 'description')
  const continent = getField(location, 'continent')
  const country = getField(location, 'country')
  const region = getField(location, 'region')

  return (
    <div className="border rounded-lg p-4 bg-card hover:shadow-md transition-all cursor-pointer relative group">
      {/* Edit button - appears on hover */}
      {onEdit && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onEdit(location)
          }}
          className="absolute top-3 right-3 p-2 opacity-0 group-hover:opacity-100 bg-primary text-primary-foreground rounded-md transition-all hover:bg-primary/90 z-10"
          title={t('common.edit')}
        >
          <Edit3 className="h-4 w-4" />
        </button>
      )}

      {/* Location Name */}
      <h3 className="font-semibold text-lg mb-2 pr-10">{location.name}</h3>

      {/* Location Type */}
      {locationType && (
        <p className="text-xs text-muted-foreground font-medium mb-2">
          {locationType}
        </p>
      )}

      {/* Geographic Hierarchy */}
      {(continent || country || region) && (
        <div className="bg-muted/50 p-2 rounded mb-3 text-xs space-y-1">
          {continent && (
            <p>
              <span className="font-medium text-muted-foreground">{t('entityFields.continent')}:</span>{' '}
              {continent}
            </p>
          )}
          {country && (
            <p>
              <span className="font-medium text-muted-foreground">{t('entityFields.country')}:</span>{' '}
              {country}
            </p>
          )}
          {region && (
            <p>
              <span className="font-medium text-muted-foreground">{t('entityFields.region')}:</span>{' '}
              {region}
            </p>
          )}
        </div>
      )}

      {/* Description */}
      {description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
          {description}
        </p>
      )}

      {/* Aliases */}
      {location.aliases && location.aliases.length > 0 && (
        <div className="text-xs">
          <span className="font-medium text-muted-foreground">{t('entityFields.aliases')}:</span>
          <p className="text-muted-foreground">{location.aliases.join(', ')}</p>
        </div>
      )}
    </div>
  )
}
