import { supabase } from '@/lib/supabase'

export interface TimelineEvent {
  id: string
  name: string
  description: string | null
  time_label: string | null
  time_start: string | null
  time_end: string | null
  participants: Array<{ id: string; name: string; entity_type: string }>
  location: string | null
  branch_id: string | null
  created_at: string
}

/**
 * Fetch all events for a project, optionally filtered by branch
 * Ordered chronologically by time_start, then created_at
 */
export async function getProjectEvents(
  projectId: string,
  branchId?: string
): Promise<TimelineEvent[]> {
  let query = supabase
    .from('knowledge_events')
    .select(
      `
      id,
      name,
      description,
      attributes,
      branch_id,
      created_at,
      knowledge_event_participants (
        entity_id,
        knowledge_entities (id, canonical_name, entity_type)
      )
    `
    )
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (branchId) {
    query = query.or(`branch_id.eq.${branchId},branch_id.is.null`)
  } else {
    query = query.is('branch_id', null)
  }

  const { data, error } = await query

  if (error) throw error

  return (data || []).map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    time_label: row.attributes?.time_label || null,
    time_start: row.attributes?.time_start || null,
    time_end: row.attributes?.time_end || null,
    participants: row.knowledge_event_participants.map((p: any) => ({
      id: p.knowledge_entities.id,
      name: p.knowledge_entities.canonical_name,
      entity_type: p.knowledge_entities.entity_type,
    })),
    location: row.attributes?.location || null,
    branch_id: row.branch_id,
    created_at: row.created_at,
  }))
}

/**
 * Create a new event in a Branch
 */
export async function createBranchEvent(
  projectId: string,
  branchId: string,
  name: string,
  description: string | null,
  participants: string[], // entity IDs
  location: string | null,
  timeLabel: string | null
): Promise<TimelineEvent> {
  const { data, error } = await supabase
    .from('knowledge_events')
    .insert({
      project_id: projectId,
      name,
      description,
      attributes: {
        location,
        time_label: timeLabel,
        participants: participants, // Store for reference
      },
      branch_id: branchId,
    })
    .select('*')
    .single()

  if (error) throw error

  // Link participants
  for (const participantId of participants) {
    await supabase.from('knowledge_event_participants').insert({
      event_id: data.id,
      entity_id: participantId,
      role: null,
    }).select('*').single()
  }

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    time_label: data.attributes?.time_label || null,
    time_start: data.attributes?.time_start || null,
    time_end: data.attributes?.time_end || null,
    participants: participants.map(id => ({ id, name: '', entity_type: '' })), // Placeholder
    location: data.attributes?.location || null,
    branch_id: data.branch_id,
    created_at: data.created_at,
  }
}

/**
 * Update event details
 */
export async function updateBranchEvent(
  eventId: string,
  updates: Partial<TimelineEvent>
): Promise<void> {
  const { error } = await supabase
    .from('knowledge_events')
    .update({
      name: updates.name,
      description: updates.description,
      attributes: {
        location: updates.location,
        time_label: updates.time_label,
        time_start: updates.time_start,
        time_end: updates.time_end,
      },
    })
    .eq('id', eventId)

  if (error) throw error
}

/**
 * Get chronologically sorted events for timeline display
 */
export async function getTimelineEventsSorted(
  projectId: string,
  branchId?: string
): Promise<TimelineEvent[]> {
  const events = await getProjectEvents(projectId, branchId)

  // Sort by time_start (if available), then by created_at
  return events.sort((a, b) => {
    if (a.time_start && b.time_start) {
      return new Date(a.time_start).getTime() - new Date(b.time_start).getTime()
    }
    if (a.time_start) return -1
    if (b.time_start) return 1
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
}
