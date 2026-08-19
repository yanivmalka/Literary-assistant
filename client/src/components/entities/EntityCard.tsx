import { useTranslation } from 'react-i18next'
import { CheckCircle, XCircle, Eye, Edit3 } from 'lucide-react'
import type { Entity } from '@/stores/entityStore'

interface EntityCardProps {
  entity: Entity
  onConfirm: (id: string) => void
  onDismiss: (id: string) => void
  onViewDetails?: (id: string) => void
  onClick?: () => void
}

const TYPE_COLORS: Record<string, string> = {
  character: 'bg-blue-100 text-blue-800',
  location: 'bg-green-100 text-green-800',
  country: 'bg-emerald-100 text-emerald-800',
  continent: 'bg-teal-100 text-teal-800',
  region: 'bg-cyan-100 text-cyan-800',
  object: 'bg-amber-100 text-amber-800',
  ability: 'bg-orange-100 text-orange-800',
  magic_ability: 'bg-purple-100 text-purple-800',
  event: 'bg-rose-100 text-rose-800',
}

/** Resolve a field value from structured_fields first, then attributes, then null */
function getField(entity: Entity, field: string): string | null {
  const sf = entity.structured_fields as Record<string, unknown> | undefined
  if (sf && sf[field] != null && sf[field] !== '') return String(sf[field])
  const attr = entity.attributes as Record<string, unknown> | undefined
  if (attr && attr[field] != null && attr[field] !== '') return String(attr[field])
  return null
}

const UNKNOWN_LABEL = 'לא ידוע'

export default function EntityCard({ entity, onConfirm, onDismiss, onViewDetails, onClick }: EntityCardProps) {
  const { t } = useTranslation()
  const typeColor = TYPE_COLORS[entity.entity_type] || 'bg-gray-100 text-gray-800'
  const isCharacter = entity.entity_type === 'character'

  return (
    <div
      className={`border rounded-lg p-3 bg-card hover:shadow-sm transition-shadow ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-sm truncate">{entity.name}</h4>
            <span className={`text-xs px-1.5 py-0.5 rounded ${typeColor}`}>
              {t(`entities.typesSingular.${entity.entity_type}`)}
            </span>
            {entity.source === 'user' && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                ידני
              </span>
            )}
          </div>

          {/* Character quick attributes */}
          {isCharacter && (
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
              <CharacterAttr label={t('entityFields.age')} value={getField(entity, 'age')} />
              <CharacterAttr label={t('entityFields.height')} value={getField(entity, 'height')} />
              <CharacterAttr label={t('entityFields.eye_color')} value={getField(entity, 'eye_color')} />
              <CharacterAttr label={t('entityFields.hair_color')} value={getField(entity, 'hair_color')} />
            </div>
          )}

          {/* Description for non-character entities */}
          {!isCharacter && entity.description && (
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {entity.description}
            </p>
          )}
          {entity.aliases.length > 0 && (
            <div className="text-xs mt-1">
              <span className="font-medium text-muted-foreground">{t('entityFields.aliases')}:</span>{' '}
              <span>{entity.aliases.join(', ')}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {entity.status === 'pending' && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onConfirm(entity.id) }}
                className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors"
                title={t('entities.confirm')}
              >
                <CheckCircle className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDismiss(entity.id) }}
                className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                title={t('entities.dismiss')}
              >
                <XCircle className="h-4 w-4" />
              </button>
              {onViewDetails && (
                <button
                  onClick={(e) => { e.stopPropagation(); onViewDetails(entity.id) }}
                  className="p-1 text-muted-foreground hover:bg-muted rounded transition-colors"
                  title={t('entities.viewDetails')}
                >
                  <Eye className="h-4 w-4" />
                </button>
              )}
            </>
          )}

          {entity.status === 'confirmed' && onClick && (
            <Edit3 className="h-3.5 w-3.5 text-muted-foreground" />
          )}

          {entity.status === 'confirmed' && !onClick && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/** A single attribute line shown on character cards */
function CharacterAttr({ label, value }: { label: string; value: string | null }) {
  const display = value || UNKNOWN_LABEL
  const isUnknown = !value || value === UNKNOWN_LABEL

  return (
    <span className="truncate">
      <span className="font-medium text-muted-foreground">{label}:</span>{' '}
      <span className={isUnknown ? 'text-muted-foreground/60 italic' : ''}>{display}</span>
    </span>
  )
}
