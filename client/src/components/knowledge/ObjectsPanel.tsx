import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import type { Entity } from '@/stores/entityStore'

interface ObjectsPanelProps {
  character: Entity
  onBack: () => void
}

export default function ObjectsPanel({ character, onBack }: ObjectsPanelProps) {
  const { t } = useTranslation()

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="p-1 rounded-md hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
        </button>
        <div>
          <h2 className="text-xl font-bold">{t('entities.types.object')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{character.name}</p>
        </div>
      </div>

      {/* Empty State */}
      <div className="border-2 border-dashed rounded-lg p-12 text-center">
        <p className="text-muted-foreground mb-2">
          {t('entities.empty')}
        </p>
        <p className="text-xs text-muted-foreground">
          Objects associated with this character will appear here once they are identified in your documents.
        </p>
      </div>
    </div>
  )
}
