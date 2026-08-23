import { useTranslation } from 'react-i18next'
import { Edit3 } from 'lucide-react'
import type { Entity } from '@/stores/entityStore'
import type { ExtractionModelProfile } from '@/lib/extractionModels'
import { CHARACTER_FIELD_CATALOG, DYNAMIC_CHARACTER_PROFILE, isPopulatedCharacterField } from '@/lib/characterSchema'

interface CharacterTileProps {
  character: Entity
  modelProfile: ExtractionModelProfile
  onClick: () => void
  onEditClick: (e: React.MouseEvent) => void
}

function getField(entity: Entity, field: string): string | null {
  const sf = entity.structured_fields as Record<string, unknown> | undefined
  if (sf && sf[field] != null && sf[field] !== '') return String(sf[field])
  const attr = entity.attributes as Record<string, unknown> | undefined
  if (attr && attr[field] != null && attr[field] !== '') return String(attr[field])
  return null
}

export default function CharacterTile({ character, modelProfile, onClick, onEditClick }: CharacterTileProps) {
  const { t } = useTranslation()

  const age = getField(character, 'age')
  const height = getField(character, 'height')
  const eyeColor = getField(character, 'eye_color')
  const hairColor = getField(character, 'hair_color')
  const dynamicFields = Object.entries(character.structured_fields || {})
    .map(([key, value]) => ({
      key,
      value,
      definition: CHARACTER_FIELD_CATALOG.find(field => field.field_key === key),
    }))
    .filter(item => modelProfile === DYNAMIC_CHARACTER_PROFILE && item.definition && isPopulatedCharacterField(item.value))
    .slice(0, 4)

  return (
    <div
      onClick={onClick}
      className="border rounded-lg p-4 bg-card hover:shadow-md transition-all cursor-pointer relative group"
    >
      {/* Edit button - appears on hover */}
      <button
        onClick={onEditClick}
        className="absolute top-3 right-3 p-2 opacity-0 group-hover:opacity-100 bg-primary text-primary-foreground rounded-md transition-all hover:bg-primary/90 z-10"
        title={t('common.edit')}
      >
        <Edit3 className="h-4 w-4" />
      </button>

      {/* Character Name */}
      <h3 className="font-semibold text-lg mb-3 pr-10">{character.name}</h3>

      {/* Character Attributes Grid */}
      {modelProfile === DYNAMIC_CHARACTER_PROFILE ? (
        dynamicFields.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {dynamicFields.map(({ key, value, definition }) => (
              <div key={key}>
                <p className="text-xs text-muted-foreground font-medium">{t(`entityFields.dynamic.${key}`, { defaultValue: definition?.label || key })}</p>
                <p className="text-sm">{Array.isArray(value) ? value.join(', ') : String(value)}</p>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <p className="text-xs text-muted-foreground font-medium">{t('entityFields.age')}</p>
            <p className={age ? 'text-sm' : 'text-sm text-muted-foreground italic'}>
              {age || t('ui.common.unknown')}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">{t('entityFields.height')}</p>
            <p className={height ? 'text-sm' : 'text-sm text-muted-foreground italic'}>
              {height || t('ui.common.unknown')}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">{t('entityFields.eye_color')}</p>
            <p className={eyeColor ? 'text-sm' : 'text-sm text-muted-foreground italic'}>
              {eyeColor || t('ui.common.unknown')}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">{t('entityFields.hair_color')}</p>
            <p className={hairColor ? 'text-sm' : 'text-sm text-muted-foreground italic'}>
              {hairColor || t('ui.common.unknown')}
            </p>
          </div>
        </div>
      )}

      {/* Description if available */}
      {getField(character, 'description') && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
          {getField(character, 'description')}
        </p>
      )}

      {/* Aliases */}
      {character.aliases && character.aliases.length > 0 && (
        <div className="text-xs">
          <span className="font-medium text-muted-foreground">{t('entityFields.aliases')}:</span>
          <p className="text-muted-foreground">{character.aliases.join(', ')}</p>
        </div>
      )}
    </div>
  )
}
