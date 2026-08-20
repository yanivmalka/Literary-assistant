import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import type { Contradiction } from '@/stores/contradictionStore'

interface ContradictionCardProps {
  contradiction: Contradiction
  onResolve: (id: string, status: string) => void
}

export default function ContradictionCard({ contradiction, onResolve }: ContradictionCardProps) {
  const { t } = useTranslation()
  const isOpen = contradiction.status === 'open'

  return (
    <div className={`border rounded-lg p-4 ${isOpen ? 'border-amber-200 bg-amber-50/30' : 'opacity-60'}`}>
      {/* Header */}
      <div className="flex items-start gap-2 mb-3">
        <AlertTriangle className={`h-4 w-4 flex-shrink-0 mt-0.5 ${isOpen ? 'text-amber-600' : 'text-muted-foreground'}`} />
        <div>
          <p className="text-sm font-medium">
            {contradiction.entity_id ? `Entity: ${contradiction.entity_id.slice(0, 8)}` : t('contradictions.unknownEntity')}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{contradiction.field_path}</p>
          {contradiction.contradiction_type && (
            <p className="text-xs text-muted-foreground">{contradiction.contradiction_type}</p>
          )}
        </div>
      </div>

      {/* Values (placeholder: will be enhanced in v1.5) */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-red-50 border border-red-100 rounded p-2">
          <p className="text-xs text-muted-foreground">Value A</p>
          <p className="text-sm font-medium text-red-800 truncate">{contradiction.value_a_id?.slice(0, 8) || 'N/A'}</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded p-2">
          <p className="text-xs text-muted-foreground">Value B</p>
          <p className="text-sm font-medium text-blue-800 truncate">{contradiction.value_b_id?.slice(0, 8) || 'N/A'}</p>
        </div>
      </div>

      {/* Resolution buttons */}
      {isOpen && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onResolve(contradiction.id, 'resolved_fix_profile')}
            className="text-xs px-2 py-1 border rounded hover:bg-muted transition-colors"
          >
            {t('contradictions.fixProfile')}
          </button>
          <button
            onClick={() => onResolve(contradiction.id, 'resolved_fix_text')}
            className="text-xs px-2 py-1 border rounded hover:bg-muted transition-colors"
          >
            {t('contradictions.fixText')}
          </button>
          <button
            onClick={() => onResolve(contradiction.id, 'resolved_intentional')}
            className="text-xs px-2 py-1 border rounded hover:bg-muted transition-colors"
          >
            {t('contradictions.intentional')}
          </button>
          <button
            onClick={() => onResolve(contradiction.id, 'ignored')}
            className="text-xs px-2 py-1 text-muted-foreground hover:bg-muted rounded transition-colors"
          >
            {t('contradictions.ignore')}
          </button>
        </div>
      )}

      {/* Resolution status */}
      {!isOpen && contradiction.resolution_note && (
        <p className="text-xs text-muted-foreground italic mt-1">{contradiction.resolution_note}</p>
      )}
    </div>
  )
}
