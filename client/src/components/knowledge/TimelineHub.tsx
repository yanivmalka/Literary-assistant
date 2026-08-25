import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar } from 'lucide-react'
import { getTimelineEventsSorted } from '@/lib/eventService'
import { useBranchStore } from '@/stores/branchStore'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

interface TimelineHubProps {
  projectId: string
}

export default function TimelineHub({ projectId }: TimelineHubProps) {
  const { t } = useTranslation()
  const { currentBranch } = useBranchStore()
  const [loading, setLoading] = useState(false)
  const [events, setEvents] = useState<any[]>([])

  useEffect(() => {
    if (!projectId) return

    setLoading(true)
    getTimelineEventsSorted(projectId, currentBranch?.id)
      .then(setEvents)
      .catch((err: any) => {
        console.error('Failed to load events:', err)
        setEvents([])
      })
      .finally(() => setLoading(false))
  }, [projectId, currentBranch?.id])

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Calendar className="h-6 w-6 text-primary" />
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t('timeline.title')}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {currentBranch ? currentBranch.name : t('timeline.mainLayer')}
        </p>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          {t('common.loading')}
        </div>
      ) : events.length === 0 ? (
        /* Empty State */
        <div className="text-center py-12 border border-border rounded-lg bg-muted/30">
          <Calendar className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground mb-2">{t('timeline.noEvents')}</p>
          <p className="text-xs text-muted-foreground">
            {t('timeline.eventsComingSoon')}
          </p>
        </div>
      ) : (
        /* Timeline */
        <div className="space-y-6">
          {events.map((event, index) => (
            <div key={event.id} className="relative">
              {/* Timeline connector */}
              {index < events.length - 1 && (
                <div className="absolute start-6 top-12 w-0.5 h-12 bg-border" />
              )}

              {/* Event card */}
              <div className="flex gap-4">
                {/* Timeline dot */}
                <div className="flex flex-col items-center pt-1">
                  <div className="w-3 h-3 rounded-full bg-primary ring-4 ring-background" />
                </div>

                {/* Content */}
                <div className="flex-1 pb-6">
                  <Card className="p-4 hover:bg-accent/50 transition-colors">
                    {/* Event time */}
                    {(event.time_label || event.time_start) && (
                      <div className="text-xs font-semibold text-primary mb-1">
                        {event.time_label || new Date(event.time_start!).toLocaleDateString()}
                      </div>
                    )}

                    {/* Event title */}
                    <h3 className="font-display font-semibold text-lg mb-2">{event.name}</h3>

                    {/* Event description */}
                    {event.description && (
                      <p className="text-sm text-muted-foreground mb-3">{event.description}</p>
                    )}

                    {/* Location */}
                    {event.location && (
                      <div className="text-sm mb-2">
                        <span className="font-medium">{t('entityFields.location')}:</span>{' '}
                        <span className="text-muted-foreground">{event.location}</span>
                      </div>
                    )}

                    {/* Branch indicator */}
                    {event.branch_id && (
                      <Badge variant="warning" className="mt-3">
                        {t('branch.proposal')}
                      </Badge>
                    )}
                  </Card>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
