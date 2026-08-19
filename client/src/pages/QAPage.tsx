import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MessageSquare } from 'lucide-react'
import QAPanel from '@/components/qa/QAPanel'
import ProjectBreadcrumb from '@/components/ProjectBreadcrumb'

export default function QAPage() {
  const { t } = useTranslation()
  const { projectId } = useParams<{ projectId: string }>()

  if (!projectId) return null

  return (
    <div className="max-w-3xl mx-auto p-6">
      <ProjectBreadcrumb currentPage="qa" />

      <div className="mb-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          {t('qa.title')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{t('qa.subtitle')}</p>
      </div>
      <div className="border rounded-lg overflow-hidden">
        <QAPanel projectId={projectId} />
      </div>
    </div>
  )
}
