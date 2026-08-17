import { useTranslation } from 'react-i18next'
import { CheckCircle, XCircle, Eye } from 'lucide-react'
import type { Entity } from '@/stores/entityStore'

interface EntityCardProps {
  entity: Entity
  onConfirm: (id: string) => void
  onDismiss: (id: string) => void
  onViewDetails?: (id: string) => void
}

const TYPE_COLORS: Record<string, string> = {
  character: 'bg-blue-100 text-blue-800',
  location: 'bg-green-100 text-green-800',
  country: 'bg-emerald-100 text-emerald-800',
  continent: 'bg-teal-100 text-teal-800',
  region: 'bg-cyan-100 text-cyan-800',
  object: 'bg-amber-100 text-amber-800',
  ability: 'bg-purple-100 text-purple-800',
  magic_system: 'bg-violet-100 text-violet-800',
  event: 'bg-rose-100 text-rose-800',
}

export default function EntityCard({ entity, onConfirm, onDismiss, onViewDetails }: EntityCardProps) {
  const { t } = useTranslation()
  const typeColor = TYPE_COLORS[entity.entity_type] || 'bg-gray-100 text-gray-800'

  return (
    <div className="border rounded-lg p-3 bg-card hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-sm truncate">{entity.name}</h4>
            <span className={`text-xs px-1.5 py-0.5 rounded ${typeColor}`}>
              {t(`entities.types.${entity.entity_type}`)}
            </span>
          </div>
          {entity.aliases.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {entity.aliases.join(', ')}
            </p>
          )}
        </div>

        {entity.status === 'pending' && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onConfirm(entity.id)}
              className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors"
              title={t('entities.confirm')}
            >
              <CheckCircle className="h-4 w-4" />
            </button>
            <button
              onClick={() => onDismiss(entity.id)}
              className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
              title={t('entities.dismiss')}
            >
              <XCircle className="h-4 w-4" />
            </button>
            {onViewDetails && (
              <button
                onClick={() => onViewDetails(entity.id)}
                className="p-1 text-muted-foreground hover:bg-muted rounded transition-colors"
                title={t('entities.viewDetails')}
              >
                <Eye className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {entity.status === 'confirmed' && (
          <span className="text-xs text-green-600 flex items-center gap-1">
            <CheckCircle className="h-3 w-3" />
            {t('entities.status.confirmed')}
          </span>
        )}
      </div>
    </div>
  )
}
