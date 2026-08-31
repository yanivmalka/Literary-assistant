import { Edit3, GitBranch } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Entity } from '@/stores/entityStore'
import { Card } from '@/components/ui/Card'
import { useTheme } from '@/components/ThemeProvider'

interface LocationTileProps {
  location: Entity
  parentNames?: string[]
  /** Containment depth (1-based); shown as a badge only when the user enabled the option. */
  level?: number
  onEdit?: (location: Entity) => void
}

function getField(entity: Entity, field: string): string | null {
  const structured = entity.structured_fields as Record<string, unknown> | undefined
  const attributes = entity.attributes as Record<string, unknown> | undefined
  const value = structured?.[field] ?? attributes?.[field]
  return value == null || value === '' ? null : String(value)
}

/** Deterministic tint hue from the location name, matching the entity-list tinted-avatar pattern. */
function tintHue(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360
  return hash
}

export default function LocationTile({ location, parentNames = [], level, onEdit }: LocationTileProps) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const placeType = getField(location, 'place_type') || getField(location, 'location_type')
  const description = getField(location, 'description')
  const isDescriptiveName = getField(location, 'is_descriptive_name') === 'true'
  const customFields = Object.entries(location.structured_fields || {}).filter(([key, value]) => !['name', 'place_type', 'location_type', 'description', 'is_descriptive_name', 'is_new_type'].includes(key) && value != null && value !== '')
  const hue = tintHue(location.name)

  return (
    <Card className="p-4 hover:shadow-md transition-all relative group">
      {onEdit && (
        <button
          onClick={() => onEdit(location)}
          className="absolute top-3 end-3 p-2 opacity-0 group-hover:opacity-100 bg-primary text-primary-foreground rounded-md transition-all z-10 hover:bg-primary/90"
          title={t('common.edit')}
        >
          <Edit3 className="h-4 w-4" />
        </button>
      )}
      <div className="flex items-start gap-3 mb-2 pe-10">
        <div
          className="h-9 w-9 rounded-lg flex items-center justify-center font-display font-bold text-xs flex-shrink-0"
          style={{
            backgroundColor: `hsl(${hue} 45% ${theme === 'dark' ? '25%' : '92%'})`,
            color: `hsl(${hue} 45% ${theme === 'dark' ? '75%' : '38%'})`,
          }}
        >
          {location.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display font-semibold text-lg leading-tight">{location.name}</h3>
            {level != null && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground" title={t('ui.location.hierarchyLevel')}>
                {t('ui.location.levelBadge', { level })}
              </span>
            )}
            {isDescriptiveName && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-warning-soft text-warning" title={t('ui.location.descriptiveNameHint')}>
                {t('ui.location.descriptiveNameBadge')}
              </span>
            )}
          </div>
          {placeType && <p className="text-xs text-muted-foreground font-medium mt-0.5">{placeType}</p>}
        </div>
      </div>
      {parentNames.length > 0 && (
        <div className="bg-muted/50 p-2 rounded mb-3 text-xs">
          <div className="flex items-center gap-1 font-medium text-muted-foreground mb-1">
            <GitBranch className="h-3 w-3" />{t('ui.location.containedIn')}
          </div>
          <p>{parentNames.join(' ← ')}</p>
        </div>
      )}
      {description && <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{description}</p>}
      {customFields.length > 0 && (
        <div className="space-y-1 text-xs border-t border-border pt-2 mt-2">
          {customFields.slice(0, 3).map(([key, value]) => (
            <p key={key}><span className="font-medium text-muted-foreground">{key}:</span> {String(value)}</p>
          ))}
        </div>
      )}
      {location.aliases?.length > 0 && (
        <div className="text-xs mt-2">
          <span className="font-medium text-muted-foreground">{t('entityFields.aliases')}:</span>{' '}
          <span className="text-muted-foreground">{location.aliases.join(', ')}</span>
        </div>
      )}
    </Card>
  )
}
