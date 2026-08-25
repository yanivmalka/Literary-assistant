import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { getPendingChanges, approveChange, rejectChange, detectConflicts, type Change } from '@/lib/changeReview'
import { useBranchStore } from '@/stores/branchStore'
import ProjectBreadcrumb from '@/components/ProjectBreadcrumb'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

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
        <h1 className="font-display text-3xl font-semibold tracking-tight mb-2">{t('review.pendingChanges')}</h1>
        <p className="text-muted-foreground">{currentBranch.name}</p>
      </div>
      <div className="lit-rule mb-6" />

      {/* Conflicts */}
      {conflicts.length > 0 && (
        <div className="mb-6 border border-warning/30 bg-warning-soft rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-warning mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-display font-semibold text-warning mb-2">{t('review.potentialConflicts')}</h3>
              <ul className="space-y-1 text-sm text-warning">
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
        <div className="text-center py-12 border border-border rounded-lg bg-muted/30">
          <p className="text-muted-foreground">{t('review.noChanges')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {changes.map(change => (
            <Card key={change.id} className="p-4 hover:bg-accent/50 transition-colors">
              {/* Change type badge */}
              <div className="mb-2">
                {change.type === 'new_entity' && (
                  <Badge variant="info">{t('review.newEntity')}</Badge>
                )}
                {change.type === 'field_change' && (
                  <Badge variant="accent">{t('review.fieldChange')}</Badge>
                )}
                {change.type === 'new_relationship' && (
                  <Badge variant="success">{t('review.newRelationship')}</Badge>
                )}
                {change.type === 'remove_relationship' && (
                  <Badge variant="danger">{t('review.removeRelationship')}</Badge>
                )}
                {change.type === 'new_event' && (
                  <Badge variant="info">{t('review.newEvent')}</Badge>
                )}
              </div>

              {/* Change details */}
              <div className="mb-4">
                {change.type === 'new_entity' && (
                  <div>
                    <h4 className="font-display font-semibold">{change.entity_name}</h4>
                    <p className="text-sm text-muted-foreground">
                      {t('review.newEntityDescription', { type: change.entity_type })}
                    </p>
                  </div>
                )}

                {(change.type === 'new_relationship' || change.type === 'remove_relationship') && (
                  <div>
                    <h4 className="font-display font-semibold">
                      {change.entity_name} → {change.relationship_type} → {change.target_entity_name}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {t(change.type === 'remove_relationship' ? 'review.removeRelationshipDescription' : 'review.newRelationshipDescription')}
                    </p>
                  </div>
                )}

                {change.type === 'new_event' && (
                  <div>
                    <h4 className="font-display font-semibold">{change.event_name}</h4>
                    <p className="text-sm text-muted-foreground">{t('review.newEventDescription')}</p>
                  </div>
                )}

                {change.type === 'field_change' && (
                  <div>
                    <h4 className="font-display font-semibold">{change.entity_name}</h4>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="font-medium text-muted-foreground">{t('review.main')}</p>
                        <p className="text-foreground">{change.main_value || t('review.empty')}</p>
                      </div>
                      <div>
                        <p className="font-medium text-muted-foreground">{t('review.branch')}</p>
                        <p className="text-foreground">{change.branch_value || t('review.empty')}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleApprove(change)} disabled={processing === change.id}>
                  <CheckCircle className="h-4 w-4" />
                  {t('review.approve')}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => handleReject(change)} disabled={processing === change.id}>
                  <XCircle className="h-4 w-4" />
                  {t('review.reject')}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
