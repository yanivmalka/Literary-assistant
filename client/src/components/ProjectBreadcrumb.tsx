import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight, FolderOpen, FileText, MessageSquare, AlertTriangle, GitBranch, Users } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'

interface ProjectBreadcrumbProps {
  currentPage: 'documents' | 'entities' | 'qa' | 'contradictions' | 'branches'
  showTabs?: boolean
}

const NAV_ITEMS = [
  { key: 'documents', path: 'documents', icon: FileText, label: 'documents.title' },
  { key: 'entities', path: 'entities', icon: Users, label: 'entities.title' },
  { key: 'qa', path: 'qa', icon: MessageSquare, label: 'qa.title' },
  { key: 'contradictions', path: 'contradictions', icon: AlertTriangle, label: 'contradictions.title' },
  { key: 'branches', path: 'branches', icon: GitBranch, label: 'branch.title' },
] as const

export default function ProjectBreadcrumb({ currentPage, showTabs = true }: ProjectBreadcrumbProps) {
  const { t } = useTranslation()
  const { projectId } = useParams<{ projectId: string }>()
  const { currentProject, fetchProject } = useProjectStore()

  useEffect(() => {
    if (projectId && (!currentProject || currentProject.id !== projectId)) {
      fetchProject(projectId)
    }
  }, [projectId, currentProject, fetchProject])

  const projectName = currentProject?.name || t('common.loading')

  return (
    <div className="mb-6">
      {/* Breadcrumb */}
      <nav aria-label={t('nav.breadcrumb')} className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3">
        <Link
          to="/projects"
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          {t('projects.title')}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
        <Link
          to={`/projects/${projectId}`}
          className="hover:text-foreground transition-colors max-w-[200px] truncate"
        >
          {projectName}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
        <span className="text-foreground font-medium">
          {t(NAV_ITEMS.find(item => item.key === currentPage)?.label || '')}
        </span>
      </nav>

      {/* Sub-navigation tabs */}
      {showTabs && (
        <div className="flex flex-wrap gap-1 border-b pb-2">
          {NAV_ITEMS.map(item => {
            const isActive = item.key === currentPage
            return (
              <Link
                key={item.key}
                to={`/projects/${projectId}/${item.path}`}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <item.icon className="h-3.5 w-3.5" />
                {t(item.label)}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
