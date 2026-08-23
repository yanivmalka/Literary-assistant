import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import { Calendar } from 'lucide-react'
import { getTimelineEventsSorted, type TimelineEvent } from '@/lib/eventService'
import { useBranchStore } from '@/stores/branchStore'
import ProjectBreadcrumb from '@/components/ProjectBreadcrumb'

export default function TimelinePage() {
  const { t } = useTranslation()
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()

  const { currentBranch } = useBranchStore()
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!projectId) return

    setLoading(true)
    getTimelineEventsSorted(projectId, currentBranch?.id)
      .then(setEvents)
      .catch((err: any) => console.error('Failed to load events:', err))
      .finally(() => setLoading(false))
  }, [projectId, currentBranch?.id])

  if (!projectId) {
    return <div className="text-center py-12">{t('common.loading')}</div>
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <ProjectBreadcrumb currentPage="timeline" showTabs={false} />

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Calendar className="h-8 w-8 text-indigo-600" />
          <h1 className="text-3xl font-bold">{t('timeline.title')}</h1>
        </div>
        <p className="text-muted-foreground">
          {currentBranch ? `${currentBranch.name}` : t('timeline.mainLayer')}
        </p>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          {t('common.loading')}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border rounded-lg bg-muted/30">
          <p>{t('timeline.noEvents')}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {events.map((event, index) => (
            <div key={event.id} className="relative">
              {/* Timeline connector */}
              {index < events.length - 1 && (
                <div className="absolute left-6 top-12 w-0.5 h-12 bg-border" />
              )}

              {/* Event card */}
              <div className="flex gap-4">
                {/* Timeline dot */}
                <div className="flex flex-col items-center pt-1">
                  <div className="w-3 h-3 rounded-full bg-indigo-600 ring-4 ring-background" />
                </div>

                {/* Content */}
                <div className="flex-1 pb-6">
                  <div className="border rounded-lg p-4 bg-card hover:bg-accent/50 transition-colors">
                    {/* Event time */}
                    {(event.time_label || event.time_start) && (
                      <div className="text-xs font-semibold text-indigo-600 mb-1">
                        {event.time_label || new Date(event.time_start!).toLocaleDateString()}
                      </div>
                    )}

                    {/* Event title */}
                    <h3 className="font-semibold text-lg mb-2">{event.name}</h3>

                    {/* Event description */}
                    {event.description && (
                      <p className="text-sm text-muted-foreground mb-3">{event.description}</p>
                    )}

                    {/* Location */}
                    {event.location && (
                      <div className="text-sm mb-2">
                        <span className="font-medium">{t('timeline.location')}:</span>{' '}
                        <span className="text-muted-foreground">{event.location}</span>
                      </div>
                    )}

                    {/* Participants */}
                    {event.participants.length > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs font-medium mb-2 text-muted-foreground">
                          {t('timeline.participants')}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {event.participants.map(participant => (
                            <button
                              key={participant.id}
                              onClick={() =>
                                navigate(
                                  `/projects/${projectId}/entities/${participant.id}?type=${participant.entity_type}`
                                )
                              }
                              className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded text-sm hover:bg-accent transition-colors"
                            >
                              <span className="text-xs">
                                {participant.entity_type[0].toUpperCase()}
                              </span>
                              <span>{participant.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Branch indicator */}
                    {event.branch_id && (
                      <div className="mt-3 text-xs text-amber-600 bg-amber-50 rounded px-2 py-1 inline-block">
                        {t('timeline.branchProposal')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
