import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react'
import type { QASource } from '@/stores/qaStore'
import { Card } from '@/components/ui/Card'

interface SourceReferenceProps {
  source: QASource
  index: number
}

export default function SourceReference({ source, index }: SourceReferenceProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const label = source.chapterTitle
    ? `${t('qa.chapter')} ${source.chapterNumber}: ${source.chapterTitle}`
    : source.chapterNumber
      ? `${t('qa.chapter')} ${source.chapterNumber}`
      : source.page
        ? `${t('qa.page')} ${source.page}`
        : `${t('qa.source')} ${index + 1}`

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
      >
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <BookOpen className="h-3 w-3" />
          {label}
          {source.documentName && (
            <bdi dir="auto" className="text-muted-foreground/60"> • {source.documentName}</bdi>
          )}
        </span>
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {expanded && (
        <div className="px-3 py-2 border-t border-border bg-muted/20">
          <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
            {source.content}
          </p>
        </div>
      )}
    </Card>
  )
}
