import { useTranslation } from 'react-i18next'
import { Edit3 } from 'lucide-react'
import type { Entity } from '@/stores/entityStore'
import type { ExtractionModelProfile } from '@/lib/extractionModels'
import {
  getPopulatedCharacterFields,
  isDynamicCharacterProfile,
  isPopulatedCharacterField,
  type CharacterFieldDefinition,
} from '@/lib/characterSchema'

interface CharacterTileProps {
  character: Entity
  modelProfile: ExtractionModelProfile
  definitions?: CharacterFieldDefinition[]
  onClick: () => void
  onEditClick: (e: React.MouseEvent) => void
}

function getField(entity: Entity, field: string): string | null {
  const sf = entity.structured_fields as Record<string, unknown> | undefined
  if (sf && isPopulatedCharacterField(sf[field])) return String(sf[field])
  const attr = entity.attributes as Record<string, unknown> | undefined
  if (attr && isPopulatedCharacterField(attr[field])) return String(attr[field])
  return null
}

function displayValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object' && value !== null) return JSON.stringify(value)
  return String(value)
}

export default function CharacterTile({ character, modelProfile, definitions = [], onClick, onEditClick }: CharacterTileProps) {
  const { t } = useTranslation()
  const isDynamicProfile = isDynamicCharacterProfile(modelProfile)
  const populatedFields = getPopulatedCharacterFields(character, modelProfile, definitions)
  const preferredKeys = ['age', 'height', 'gender', 'eye_color', 'hair_color', 'hair_type']
  const dynamicFields = preferredKeys
    .map(key => populatedFields.find(field => field.key === key))
    .filter((field): field is typeof populatedFields[number] => Boolean(field))
    .slice(0, 6)

  const age = getField(character, 'age')
  const height = getField(character, 'height')
  const eyeColor = getField(character, 'eye_color')
  const hairColor = getField(character, 'hair_color')

  return (
    <div
      onClick={onClick}
      className="border rounded-lg p-4 bg-card hover:shadow-md transition-all cursor-pointer relative group"
    >
      <button
        onClick={onEditClick}
        className="absolute top-3 end-3 p-2 opacity-0 group-hover:opacity-100 bg-primary text-primary-foreground rounded-md transition-all hover:bg-primary/90 z-10"
        title={t('common.edit')}
      >
        <Edit3 className="h-4 w-4" />
      </button>

      <h3 className="font-semibold text-lg mb-3 pe-10">{character.name}</h3>

      {isDynamicProfile ? (
        dynamicFields.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {dynamicFields.map(({ key, value, definition }) => (
              <div key={key}>
                <p className="text-xs text-muted-foreground font-medium">
                  {t(`entityFields.dynamic.${key}`, { defaultValue: definition.label || key })}
                </p>
                <p className="text-sm">{displayValue(value)}</p>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[
            ['age', age],
            ['height', height],
            ['eye_color', eyeColor],
            ['hair_color', hairColor],
          ].map(([key, value]) => (
            <div key={key}>
              <p className="text-xs text-muted-foreground font-medium">{t(`entityFields.${key}`)}</p>
              <p className={value ? 'text-sm' : 'text-sm text-muted-foreground italic'}>
                {value || t('ui.common.unknown')}
              </p>
            </div>
          ))}
        </div>
      )}

      {getField(character, 'description') && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
          {getField(character, 'description')}
        </p>
      )}

      {character.aliases && character.aliases.length > 0 && (
        <div className="text-xs">
          <span className="font-medium text-muted-foreground">{t('entityFields.aliases')}:</span>
          <p className="text-muted-foreground">{character.aliases.join(', ')}</p>
        </div>
      )}
    </div>
  )
}
