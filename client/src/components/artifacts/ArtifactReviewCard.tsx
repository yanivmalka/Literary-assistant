import { useTranslation } from 'react-i18next'
import { Braces, CheckCircle2, ChevronDown, ChevronUp, FileText, Loader2, XCircle } from 'lucide-react'
import type { ExpertArtifact, ArtifactSourceChunk } from '@/stores/artifactStore'

interface ArtifactReviewCardProps {
  artifact: ExpertArtifact
  documentName?: string
  expanded: boolean
  sources: ArtifactSourceChunk[] | undefined
  onToggle: () => void
}

function arrayCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
}

export default function ArtifactReviewCard({
  artifact,
  documentName,
  expanded,
  sources,
  onToggle,
}: ArtifactReviewCardProps) {
  const { t } = useTranslation()
  const parsed = artifact.parsed_response ?? {}
  const statusLabel = t(`artifacts.status.${artifact.status}`)
  const statusIcon = artifact.status === 'succeeded'
    ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
    : artifact.status === 'failed'
      ? <XCircle className="h-4 w-4 text-destructive" />
      : <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />

  return (
    <article className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 p-4 text-start hover:bg-muted/40"
        aria-expanded={expanded}
      >
        <span className="min-w-0 space-y-1">
          <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {statusIcon}
            <span>{t(`artifacts.roles.${artifact.role}`)}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal">
              {statusLabel}
            </span>
          </span>
          <span className="block text-xs text-muted-foreground">
            {documentName || artifact.document_id} · {t('artifacts.window')} {artifact.window_id}
          </span>
          <span className="block text-xs text-muted-foreground">
            {t('artifacts.run')} {artifact.extraction_run_id} · {t('artifacts.model')} {artifact.model || t('artifacts.notAvailable')}
          </span>
        </span>
        {expanded ? <ChevronUp className="h-4 w-4 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 flex-shrink-0" />}
      </button>

      {expanded && (
        <div className="space-y-4 border-t p-4">
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded bg-muted/50 p-2">
              <div className="text-muted-foreground">{t('artifacts.chunks')}</div>
              <div className="font-medium">{artifact.chunk_positions.join(', ') || '—'}</div>
            </div>
            <div className="rounded bg-muted/50 p-2">
              <div className="text-muted-foreground">{t('artifacts.attempt')}</div>
              <div className="font-medium">{artifact.attempt}</div>
            </div>
            <div className="rounded bg-muted/50 p-2">
              <div className="text-muted-foreground">{t('artifacts.tokens')}</div>
              <div className="font-medium">{artifact.total_tokens ?? '—'}</div>
            </div>
            <div className="rounded bg-muted/50 p-2">
              <div className="text-muted-foreground">{t('artifacts.latency')}</div>
              <div className="font-medium">{artifact.latency_ms ?? '—'} ms</div>
            </div>
          </div>

          {artifact.error_message && (
            <div className="rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {artifact.error_message}
            </div>
          )}

          {artifact.status === 'succeeded' && (
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded bg-blue-50 px-2 py-1 text-blue-800">
                {t('artifacts.entities')}: {arrayCount(parsed.entities)}
              </span>
              <span className="rounded bg-indigo-50 px-2 py-1 text-indigo-800">
                {t('artifacts.events')}: {arrayCount(parsed.events)}
              </span>
              <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-800">
                {t('artifacts.relationships')}: {arrayCount(parsed.relationships)}
              </span>
            </div>
          )}

          {sources && sources.length > 0 && (
            <div className="space-y-2">
              <h4 className="flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4 text-muted-foreground" />
                {t('artifacts.evidence')}
              </h4>
              {sources.map(source => (
                <div key={source.id} className="rounded border bg-muted/20 p-3">
                  <div className="mb-1 text-xs text-muted-foreground">
                    {source.chapter_title || t('artifacts.chunk')} · {t('qa.page')} {source.page ?? '—'} · #{source.position}
                  </div>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed">{source.content}</p>
                </div>
              ))}
            </div>
          )}

          {sources && sources.length === 0 && (
            <p className="text-xs text-muted-foreground">{t('artifacts.noEvidence')}</p>
          )}

          {artifact.parsed_response && (
            <details className="rounded border">
              <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium">
                <Braces className="h-3.5 w-3.5" />
                {t('artifacts.parsedOutput')}
              </summary>
              <pre className="max-h-96 overflow-auto border-t bg-muted/20 p-3 text-[11px] leading-relaxed">
                {JSON.stringify(artifact.parsed_response, null, 2)}
              </pre>
            </details>
          )}

          <p className="text-xs text-muted-foreground">{t('artifacts.readOnlyNotice')}</p>
        </div>
      )}
    </article>
  )
}
