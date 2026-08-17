import { useTranslation } from 'react-i18next'
import { Merge, X } from 'lucide-react'
import type { MergeSuggestion as MergeSuggestionType } from '@/stores/entityStore'

interface MergeSuggestionProps {
  suggestion: MergeSuggestionType
  onMerge: (entityAId: string, entityBId: string) => void
  onDismiss?: () => void
}

export default function MergeSuggestion({ suggestion, onMerge, onDismiss }: MergeSuggestionProps) {
  const { t } = useTranslation()

  return (
    <div className="border border-amber-200 bg-amber-50/50 rounded-lg p-3">
      <p className="text-xs text-amber-700 mb-2">{t('entities.mergeSuggestion')}</p>
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
        <button
          onClick={() => onMerge(suggestion.entityA.id, suggestion.entityB.id)}
          className="flex items-center gap-1 text-xs px-2 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90"
        >
          <Merge className="h-3 w-3" />
          {t('entities.merge')}
        </button>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="flex items-center gap-1 text-xs px-2 py-1 text-muted-foreground hover:bg-muted rounded"
          >
            <X className="h-3 w-3" />
            {t('entities.keepSeparate')}
          </button>
        )}
      </div>
    </div>
  )
}
