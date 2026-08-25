import { useTranslation } from 'react-i18next'
import { Merge, X } from 'lucide-react'
import type { MergeSuggestion as MergeSuggestionType } from '@/stores/entityStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

interface MergeSuggestionProps {
  suggestion: MergeSuggestionType
  onMerge: (entityAId: string, entityBId: string) => void
  onDismiss?: () => void
}

export default function MergeSuggestion({ suggestion, onMerge, onDismiss }: MergeSuggestionProps) {
  const { t } = useTranslation()

  return (
    <Card className="p-3 bg-warning-soft/40 border-warning/20">
      <p className="text-xs font-semibold text-warning mb-2">{t('entities.mergeSuggestion')}</p>
      <div className="flex items-center gap-3">
        <div className="flex-1 text-sm">
          <span className="font-medium">{suggestion.entityA.name}</span>
          {suggestion.entityA.aliases.length > 0 && (
            <span className="text-muted-foreground"> ({suggestion.entityA.aliases[0]})</span>
          )}
        </div>
        <span className="text-muted-foreground text-xs">↔</span>
        <div className="flex-1 text-sm">
          <span className="font-medium">{suggestion.entityB.name}</span>
          {suggestion.entityB.aliases.length > 0 && (
            <span className="text-muted-foreground"> ({suggestion.entityB.aliases[0]})</span>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{suggestion.reason}</p>
      <div className="flex gap-2 mt-2">
        <Button size="sm" onClick={() => onMerge(suggestion.entityA.id, suggestion.entityB.id)}>
          <Merge className="h-3 w-3" />
          {t('entities.merge')}
        </Button>
        {onDismiss && (
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            <X className="h-3 w-3" />
            {t('entities.keepSeparate')}
          </Button>
        )}
      </div>
    </Card>
  )
}
