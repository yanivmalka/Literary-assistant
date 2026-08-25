import { useEffect } from 'react'
import { FileText, SlidersHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useDocumentStore } from '@/stores/documentStore'
import { useQAStore } from '@/stores/qaStore'
import { Badge } from '@/components/ui/Badge'

const SEARCHABLE_STATUSES = new Set(['ready', 'indexed', 'skipped_no_provider'])

interface SourcePickerProps {
  projectId: string
}

export default function SourcePicker({ projectId }: SourcePickerProps) {
  const { t } = useTranslation()
  const { documents, loading, fetchDocuments } = useDocumentStore()
  const {
    selectedSourceVersionIds,
    includeAdjacent,
    setSelectedSourceVersionIds,
    setIncludeAdjacent,
  } = useQAStore()

  useEffect(() => {
    void fetchDocuments(projectId)
  }, [fetchDocuments, projectId])

  const searchableDocuments = documents.filter(document => {
    const status = document.latest_version?.status
    return Boolean(document.latest_version && status && SEARCHABLE_STATUSES.has(status))
  })

  const toggleVersion = (versionId: string) => {
    const next = selectedSourceVersionIds.includes(versionId)
      ? selectedSourceVersionIds.filter(id => id !== versionId)
      : [...selectedSourceVersionIds, versionId]
    setSelectedSourceVersionIds(next)
  }

  return (
    <details className="border border-border rounded-lg bg-card" open={selectedSourceVersionIds.length > 0}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-medium">
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          {t('qa.sourcePicker.title')}
          {selectedSourceVersionIds.length > 0 && (
            <Badge variant="accent">{selectedSourceVersionIds.length}</Badge>
          )}
        </span>
        <span className="text-xs font-normal text-muted-foreground">
          {selectedSourceVersionIds.length > 0
            ? t('qa.sourcePicker.scoped')
            : t('qa.sourcePicker.allSources')}
        </span>
      </summary>

      <div className="border-t border-border px-3 py-3 space-y-3">
        <p className="text-xs text-muted-foreground">{t('qa.sourcePicker.description')}</p>

        {loading && searchableDocuments.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
        ) : searchableDocuments.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('qa.sourcePicker.empty')}</p>
        ) : (
          <div className="space-y-2">
            {searchableDocuments.map(document => {
              const version = document.latest_version!
              const checked = selectedSourceVersionIds.includes(version.id)
              return (
                <label
                  key={version.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleVersion(version.id)}
                    className="h-4 w-4 accent-primary"
                  />
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{document.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {t('qa.sourcePicker.version', { version: version.version_number })}
                  </span>
                </label>
              )
            })}
          </div>
        )}

        {selectedSourceVersionIds.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={includeAdjacent}
              onChange={event => setIncludeAdjacent(event.target.checked)}
              className="h-3.5 w-3.5 accent-primary"
            />
            {t('qa.sourcePicker.includeAdjacent')}
          </label>
        )}
      </div>
    </details>
  )
}
