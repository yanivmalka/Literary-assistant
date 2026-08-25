import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import type { Contradiction } from '@/stores/contradictionStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

interface ContradictionCardProps {
  contradiction: Contradiction
  onResolve: (id: string, status: string) => void
}

export default function ContradictionCard({ contradiction, onResolve }: ContradictionCardProps) {
  const { t } = useTranslation()
  const isOpen = contradiction.status === 'open'

  // Get entity name if available from joined data
  const entityName = contradiction.entity?.name || contradiction.entity_id?.slice(0, 8) || t('contradictions.unknownEntity')

  // Get attribute names if available from joined data
  const attributeNameA = contradiction.attribute_a?.attribute_name || t('contradictions.unknownAttribute')
  const attributeNameB = contradiction.attribute_b?.attribute_name || t('contradictions.unknownAttribute')

  // Get attribute values if available from joined data
  const attributeValueA = contradiction.attribute_a?.attribute_value || contradiction.attribute_a_id?.slice(0, 8) || 'N/A'
  const attributeValueB = contradiction.attribute_b?.attribute_value || contradiction.attribute_b_id?.slice(0, 8) || 'N/A'

  return (
    <Card className={`p-4 ${isOpen ? 'bg-warning-soft/40 border-warning/20' : 'opacity-60'}`}>
      {/* Header */}
      <div className="flex items-start gap-2 mb-3">
        <AlertTriangle className={`h-4 w-4 flex-shrink-0 mt-0.5 ${isOpen ? 'text-warning' : 'text-muted-foreground'}`} />
        <div>
          <p className="text-sm font-display font-semibold">
            {entityName}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('contradictions.comparing')} {attributeNameA} {t('contradictions.and')} {attributeNameB}
          </p>
          {contradiction.contradiction_type && (
            <p className="text-xs text-muted-foreground">{contradiction.contradiction_type}</p>
          )}
        </div>
      </div>

      {/* Values */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-destructive/5 border border-destructive/15 rounded-md p-2">
          <p className="text-xs text-muted-foreground">{t('contradictions.valueA')}</p>
          <p className="text-sm font-medium text-destructive truncate">{attributeValueA}</p>
        </div>
        <div className="bg-info-soft border border-info/15 rounded-md p-2">
          <p className="text-xs text-muted-foreground">{t('contradictions.valueB')}</p>
          <p className="text-sm font-medium text-info truncate">{attributeValueB}</p>
        </div>
      </div>

      {/* Resolution buttons */}
      {isOpen && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => onResolve(contradiction.id, 'resolved_fix_profile')}>
            {t('contradictions.fixProfile')}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onResolve(contradiction.id, 'resolved_fix_text')}>
            {t('contradictions.fixText')}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onResolve(contradiction.id, 'resolved_intentional')}>
            {t('contradictions.intentional')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onResolve(contradiction.id, 'ignored')}>
            {t('contradictions.ignore')}
          </Button>
        </div>
      )}

      {/* Resolution status */}
      {!isOpen && contradiction.resolution_note && (
        <p className="text-xs text-muted-foreground italic mt-1">{contradiction.resolution_note}</p>
      )}
    </Card>
  )
}
