import { Edit3, GitBranch } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Entity } from '@/stores/entityStore'

interface LocationTileProps {
  location: Entity
  parentNames?: string[]
  onEdit?: (location: Entity) => void
}

function getField(entity: Entity, field: string): string | null {
  const structured = entity.structured_fields as Record<string, unknown> | undefined
  const attributes = entity.attributes as Record<string, unknown> | undefined
  const value = structured?.[field] ?? attributes?.[field]
  return value == null || value === '' ? null : String(value)
}

export default function LocationTile({ location, parentNames = [], onEdit }: LocationTileProps) {
  const { t } = useTranslation()
  const placeType = getField(location, 'place_type') || getField(location, 'location_type')
  const description = getField(location, 'description')
  const customFields = Object.entries(location.structured_fields || {}).filter(([key, value]) => !['name', 'place_type', 'location_type', 'description'].includes(key) && value != null && value !== '')

  return (
    <div className="border rounded-lg p-4 bg-card hover:shadow-md transition-all relative group">
      {onEdit && <button onClick={() => onEdit(location)} className="absolute top-3 right-3 p-2 opacity-0 group-hover:opacity-100 bg-primary text-primary-foreground rounded-md transition-all z-10" title={t('common.edit')}><Edit3 className="h-4 w-4" /></button>}
      <h3 className="font-semibold text-lg mb-2 pr-10">{location.name}</h3>
      {placeType && <p className="text-xs text-muted-foreground font-medium mb-2">{placeType}</p>}
      {parentNames.length > 0 && <div className="bg-muted/50 p-2 rounded mb-3 text-xs"><div className="flex items-center gap-1 font-medium text-muted-foreground mb-1"><GitBranch className="h-3 w-3" />נמצא בתוך</div><p>{parentNames.join(' ← ')}</p></div>}
      {description && <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{description}</p>}
      {customFields.length > 0 && <div className="space-y-1 text-xs border-t pt-2 mt-2">{customFields.slice(0, 3).map(([key, value]) => <p key={key}><span className="font-medium text-muted-foreground">{key}:</span> {String(value)}</p>)}</div>}
      {location.aliases?.length > 0 && <div className="text-xs mt-2"><span className="font-medium text-muted-foreground">{t('entityFields.aliases')}:</span> <span className="text-muted-foreground">{location.aliases.join(', ')}</span></div>}
    </div>
  )
}
