import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { getPendingChanges, approveChange, rejectChange, detectConflicts, type Change } from '@/lib/changeReview'
import { useBranchStore } from '@/stores/branchStore'
import ProjectBreadcrumb from '@/components/ProjectBreadcrumb'

export default function ReviewChangesPage() {
  const { t } = useTranslation()
  const { projectId } = useParams<{ projectId: string }>()

  const { currentBranch } = useBranchStore()
  const [changes, setChanges] = useState<Change[]>([])
  const [conflicts, setConflicts] = useState<Array<{ type: string; description: string }>>([])
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId || !currentBranch) return

    setLoading(true)
    Promise.all([
      getPendingChanges(projectId, currentBranch.id),
      detectConflicts(projectId),
    ])
      .then(([changes, conflicts]) => {
        setChanges(changes)
        setConflicts(conflicts)
      })
      .catch(err => console.error('Failed to load changes:', err))
      .finally(() => setLoading(false))
  }, [projectId, currentBranch])

  const handleApprove = async (change: Change) => {
    setProcessing(change.id)
    try {
      await approveChange(change)
      setChanges(changes.filter(c => c.id !== change.id))
    } catch (err) {
      console.error('Failed to approve change:', err)
    } finally {
      setProcessing(null)
    }
  }

  const handleReject = async (change: Change) => {
    setProcessing(change.id)
    try {
      await rejectChange(change)
      setChanges(changes.filter(c => c.id !== change.id))
    } catch (err) {
      console.error('Failed to reject change:', err)
    } finally {
      setProcessing(null)
    }
  }

  if (!projectId || !currentBranch) {
    return <div className="text-center py-12">{t('common.loading')}</div>
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <ProjectBreadcrumb currentPage="documents" showTabs={false} />

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('review.pendingChanges')}</h1>
        <p className="text-muted-foreground">{currentBranch.name}</p>
      </div>

      {/* Conflicts */}
      {conflicts.length > 0 && (
        <div className="mb-6 border border-amber-200 bg-amber-50 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-amber-900 mb-2">{t('review.potentialConflicts')}</h3>
              <ul className="space-y-1 text-sm text-amber-800">
                {conflicts.map((conflict, i) => (
                  <li key={i}>• {conflict.description}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Changes list */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">{t('common.loading')}</div>
      ) : changes.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/30">
          <p className="text-muted-foreground">{t('review.noChanges')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {changes.map(change => (
            <div key={change.id} className="border rounded-lg p-4 bg-card hover:bg-accent/50 transition-colors">
              {/* Change type badge */}
              <div className="text-xs font-semibold mb-2">
                {change.type === 'new_entity' && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">{t('review.newEntity')}</span>
                )}
                {change.type === 'field_change' && (
                  <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded">{t('review.fieldChange')}</span>
                )}
                {change.type === 'new_relationship' && (
                  <span className="px-2 py-1 bg-green-100 text-green-800 rounded">{t('review.newRelationship')}</span>
                )}
                {change.type === 'remove_relationship' && (
                  <span className="px-2 py-1 bg-red-100 text-red-800 rounded">{t('review.removeRelationship')}</span>
                )}
                {change.type === 'new_event' && (
                  <span className="px-2 py-1 bg-indigo-100 text-indigo-800 rounded">{t('review.newEvent')}</span>
                )}
              </div>

              {/* Change details */}
              <div className="mb-4">
                {change.type === 'new_entity' && (
                  <div>
                    <h4 className="font-semibold">{change.entity_name}</h4>
                    <p className="text-sm text-muted-foreground">
                      {t('review.newEntityDescription', { type: change.entity_type })}
                    </p>
                  </div>
                )}

                {(change.type === 'new_relationship' || change.type === 'remove_relationship') && (
                  <div>
                    <h4 className="font-semibold">
                      {change.entity_name} → {change.relationship_type} → {change.target_entity_name}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {t(change.type === 'remove_relationship' ? 'review.removeRelationshipDescription' : 'review.newRelationshipDescription')}
                    </p>
                  </div>
                )}

                {change.type === 'new_event' && (
                  <div>
                    <h4 className="font-semibold">{change.event_name}</h4>
                    <p className="text-sm text-muted-foreground">{t('review.newEventDescription')}</p>
                  </div>
                )}

                {change.type === 'field_change' && (
                  <div>
                    <h4 className="font-semibold">{change.entity_name}</h4>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="font-medium text-muted-foreground">Main</p>
                        <p className="text-foreground">{change.main_value || '(empty)'}</p>
                      </div>
                      <div>
                        <p className="font-medium text-muted-foreground">Branch</p>
                        <p className="text-foreground">{change.branch_value || '(empty)'}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleApprove(change)}
                  disabled={processing === change.id}
                  className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm"
                >
                  <CheckCircle className="h-4 w-4" />
                  Approve
                </button>
                <button
                  onClick={() => handleReject(change)}
                  disabled={processing === change.id}
                  className="flex items-center gap-1 px-3 py-2 border border-red-300 text-red-600 rounded hover:bg-red-50 disabled:opacity-50 text-sm"
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
