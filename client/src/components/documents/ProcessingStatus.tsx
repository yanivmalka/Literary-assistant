import { useTranslation } from 'react-i18next'
import { CheckCircle, Circle, Loader2, XCircle, AlertTriangle } from 'lucide-react'

interface ProcessingStatusProps {
  status: string
  errorMessage?: string | null
  errorStage?: string | null
  onRetry?: () => void
}

const STAGES = [
  { key: 'extracting', label: 'documents.status.extracting' },
  { key: 'chunking', label: 'documents.status.chunking' },
  { key: 'indexing', label: 'documents.status.indexing' },
  { key: 'analyzing', label: 'documents.status.analyzing' },
  { key: 'ready', label: 'documents.status.ready' },
]

function getStageIndex(status: string): number {
  switch (status) {
    case 'uploaded': return -1
    case 'extracting': return 0
    case 'extracted': return 1
    case 'chunking': return 1
    case 'chunked': return 2
    case 'indexing': return 2
    case 'indexed': return 3
    case 'analyzing': return 3
    case 'ready': return 4
    case 'error': return -2
    case 'skipped_no_provider': return 2 // indexed but no AI
    default: return -1
  }
}

export default function ProcessingStatus({ status, errorMessage, errorStage, onRetry }: ProcessingStatusProps) {
  const { t } = useTranslation()
  const currentIndex = getStageIndex(status)
  const isError = status === 'error'
  const isSkipped = status === 'skipped_no_provider'

  if (status === 'ready') {
    return (
      <div className="flex items-center gap-2 text-green-600">
        <CheckCircle className="h-5 w-5" />
        <span className="text-sm font-medium">{t('documents.status.ready')}</span>
      </div>
    )
  }

  if (isSkipped) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-amber-600">
          <AlertTriangle className="h-5 w-5" />
          <span className="text-sm font-medium">{t('documents.status.skippedNoProvider')}</span>
        </div>
        <p className="text-xs text-muted-foreground">{t('documents.status.searchAvailable')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Stage indicators */}
      <div className="space-y-2">
        {STAGES.map((stage, index) => {
          let icon
          let textClass = 'text-muted-foreground'

          if (isError && errorStage && STAGES.findIndex(s => s.key === errorStage) === index) {
            icon = <XCircle className="h-4 w-4 text-destructive" />
            textClass = 'text-destructive'
          } else if (index < currentIndex || (index === currentIndex && !status.endsWith('ing'))) {
            icon = <CheckCircle className="h-4 w-4 text-green-600" />
            textClass = 'text-foreground'
          } else if (index === currentIndex && status.endsWith('ing')) {
            icon = <Loader2 className="h-4 w-4 text-primary animate-spin" />
            textClass = 'text-primary font-medium'
          } else {
            icon = <Circle className="h-4 w-4 text-muted-foreground/40" />
          }

          return (
            <div key={stage.key} className={`flex items-center gap-2 ${textClass}`}>
              {icon}
              <span className="text-sm">{t(stage.label)}</span>
            </div>
          )
        })}
      </div>

      {/* Error display */}
      {isError && errorMessage && (
        <div className="mt-3 p-3 bg-destructive/10 rounded-md">
          <p className="text-sm text-destructive">{errorMessage}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-2 text-xs px-3 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90"
            >
              {t('documents.status.retry')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
