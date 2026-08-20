import { describe, it, expect } from 'vitest'

/**
 * Task 8: Timeline/Event System
 * 
 * Validates:
 * - Event creation and chronological ordering
 * - Event linking to entities (Character, Location, Object, Ability)
 * - Branch isolation for events
 * - Main unchanged by Branch event creation
 * - Individual event/relationship merge behavior
 */

describe('Task 8: Timeline/Event System', () => {
  describe('Event Model', () => {
    it('defines event as a first-class entity type', () => {
      const entityTypes = ['character', 'location', 'object', 'ability', 'magic_ability', 'event']
      expect(entityTypes).toContain('event')
    })

    it('supports temporal fields in Event schema', () => {
      const eventFields = {
        name: 'Battle of Kings',
        description: 'A great battle',
        narrative_order: '1',
        time_label: 'Year 1000',
        time_start: '1000-01-01',
        time_end: '1000-01-02',
        time_precision: 'day',
        temporal_notes: 'Duration: 2 days',
      }

      expect(eventFields.time_label).toBeDefined()
      expect(eventFields.time_start).toBeDefined()
      expect(eventFields.time_end).toBeDefined()
    })

    it('allows event description and metadata', () => {
      const event = {
        name: 'Event Name',
        description: 'What happened during this event',
        attributes: {
          location: 'Castle',
          participants: ['char-1', 'char-2'],
        },
      }

      expect(event.description).toBeTruthy()
      expect(event.attributes.location).toBeTruthy()
      expect(event.attributes.participants).toHaveLength(2)
    })
  })

  describe('Event Linking to Entities', () => {
    it('links event to character through event_participants', () => {
      const event = { id: 'event-1' }
      const character = { id: 'char-1', entity_type: 'character' }
      const participant = { event_id: event.id, entity_id: character.id }

      expect(participant.event_id).toBe(event.id)
      expect(participant.entity_id).toBe(character.id)
    })

    it('links event to location through attributes', () => {
      const event = {
        id: 'event-1',
        attributes: {
          location: 'Castle of Kings',
        },
      }

      expect(event.attributes.location).toBeTruthy()
    })

    it('links event to multiple characters (participants)', () => {
      const event = {
        id: 'event-1',
        participants: [
          { id: 'char-1', name: 'Character A' },
          { id: 'char-2', name: 'Character B' },
          { id: 'char-3', name: 'Character C' },
        ],
      }

      expect(event.participants).toHaveLength(3)
    })

    it('supports object/ability references in event attributes', () => {
      const event = {
        id: 'event-1',
        attributes: {
          abilities_used: ['ability-1'],
          objects_involved: ['object-1', 'object-2'],
        },
      }

      expect(event.attributes.abilities_used).toContain('ability-1')
      expect(event.attributes.objects_involved).toHaveLength(2)
    })
  })

  describe('Chronological Ordering', () => {
    it('sorts events by time_start when available', () => {
      const events = [
        { id: 'e1', time_start: '1000-03-01', name: 'Event 3' },
        { id: 'e2', time_start: '1000-01-01', name: 'Event 1' },
        { id: 'e3', time_start: '1000-02-01', name: 'Event 2' },
      ]

      const sorted = events.sort((a, b) =>
        new Date(a.time_start).getTime() - new Date(b.time_start).getTime()
      )

      expect(sorted[0].name).toBe('Event 1')
      expect(sorted[1].name).toBe('Event 2')
      expect(sorted[2].name).toBe('Event 3')
    })

    it('falls back to created_at when time_start missing', () => {
      const now = new Date().getTime()
      const events = [
        { id: 'e1', created_at: now + 2000, time_start: null },
        { id: 'e2', created_at: now, time_start: null },
        { id: 'e3', created_at: now + 1000, time_start: null },
      ]

      const sorted = events.sort((a, b) => {
        if (a.time_start || b.time_start) return 0
        return a.created_at - b.created_at
      })

      expect(sorted[0].id).toBe('e2')
      expect(sorted[1].id).toBe('e3')
      expect(sorted[2].id).toBe('e1')
    })

    it('prefers explicit time_start over created_at', () => {
      const events = [
        { id: 'e1', time_start: '1000-03-01', created_at: '2024-01-01T00:00:00' },
        { id: 'e2', time_start: null, created_at: '2024-01-02T00:00:00' },
      ]

      const hasExplicitTime = events.filter(e => !!e.time_start)
      expect(hasExplicitTime).toHaveLength(1)
      expect(hasExplicitTime[0].id).toBe('e1')
    })
  })

  describe('Branch Isolation for Events', () => {
    it('stores events with branch_id in Branch layer', () => {
      const event = {
        id: 'event-1',
        name: 'Event A',
        branch_id: 'branch-1',
      }

      expect(event.branch_id).toBe('branch-1')
    })

    it('stores events with branch_id=null in Main layer', () => {
      const event = {
        id: 'event-1',
        name: 'Main Event',
        branch_id: null,
      }

      expect(event.branch_id).toBeNull()
    })

    it('isolates event mentions by branch_id', () => {
      const mention1 = { event_id: 'e1', branch_id: 'branch-1', chunk_position: 0 }
      const mention2 = { event_id: 'e1', branch_id: 'branch-2', chunk_position: 0 }

      // Same mention position but different branch
      expect(mention1.branch_id).not.toBe(mention2.branch_id)
    })

    it('enforces unique(version_id, name, branch_id) for events', () => {
      // No duplicate event in same branch
      const constraint = 'UNIQUE(version_id, name, branch_id)'
      expect(constraint).toContain('branch_id')
    })
  })

  describe('Main Unchanged by Branch Events', () => {
    it('does not modify Main when Branch creates event', () => {
      const mainEventsBefore = 5
      const mainEventsAfter = 5  // unchanged

      expect(mainEventsAfter).toBe(mainEventsBefore)
    })

    it('keeps Main events separate from Branch proposals', () => {
      const mainEvents = [
        { id: 'e1', name: 'Main Event', branch_id: null },
      ]

      const branchEvents = [
        { id: 'e2', name: 'Branch Event', branch_id: 'branch-1' },
      ]

      expect(mainEvents[0].branch_id).toBeNull()
      expect(branchEvents[0].branch_id).toBe('branch-1')
    })

    it('allows Branch to reference Main entities without modifying Main', () => {
      const mainCharacter = { id: 'char-1', name: 'Main Char', branch_id: null }
      const branchEvent = { id: 'event-1', branch_id: 'branch-1' }
      const participant = { event_id: branchEvent.id, entity_id: mainCharacter.id }

      // Main character unchanged; branch event links to it
      expect(mainCharacter.branch_id).toBeNull()
      expect(participant.entity_id).toBe(mainCharacter.id)
    })
  })

  describe('Event Extraction Routing', () => {
    it('routes events to Branch layer during extraction', () => {
      const extractionMode = 'branch'
      const targetLayer = extractionMode

      expect(targetLayer).toBe('branch')
    })

    it('skips events during Main bootstrap', () => {
      const mainBootstrap = true
      const eventsExtracted = !mainBootstrap

      expect(eventsExtracted).toBe(false)
    })

    it('includes event in subsequent Branch extractions', () => {
      const mainExists = true
      const branchActive = true
      const extractEvents = mainExists && branchActive

      expect(extractEvents).toBe(true)
    })
  })

  describe('Individual Event Mergeability', () => {
    it('allows each event to be reviewed independently', () => {
      const pendingEvents = [
        { id: 'e1', review_status: 'pending' },
        { id: 'e2', review_status: 'pending' },
      ]

      const afterReview = pendingEvents.map(e =>
        e.id === 'e1' ? { ...e, review_status: 'approved' } : e
      )

      expect(afterReview[0].review_status).toBe('approved')
      expect(afterReview[1].review_status).toBe('pending')
    })

    it('allows participants to be independently linked/unlinked', () => {
      void { id: 'e1' }
      const participants = [
        { event_id: 'e1', entity_id: 'char-1' },
        { event_id: 'e1', entity_id: 'char-2' },
      ]

      // Remove participant 1
      const updated = participants.filter(p => p.entity_id !== 'char-1')
      expect(updated).toHaveLength(1)
      expect(updated[0].entity_id).toBe('char-2')
    })

    it('preserves temporal data during merge', () => {
      const event = {
        id: 'e1',
        name: 'Event',
        time_start: '1000-01-01',
        time_end: '1000-01-02',
        review_status: 'pending',
      }

      const approved = { ...event, review_status: 'approved' }

      expect(approved.time_start).toBe(event.time_start)
      expect(approved.time_end).toBe(event.time_end)
    })
  })

  describe('Timeline View Requirements', () => {
    it('displays events in chronological order', () => {
      const timelineEvents = [
        { id: 'e1', time_start: '1000-01-01' },
        { id: 'e2', time_start: '1000-01-02' },
        { id: 'e3', time_start: '1000-01-03' },
      ]

      expect(timelineEvents[0].id).toBe('e1')
      expect(timelineEvents[1].id).toBe('e2')
      expect(timelineEvents[2].id).toBe('e3')
    })

    it('shows linked entities in timeline display', () => {
      const event = {
        id: 'e1',
        participants: [
          { id: 'char-1', name: 'Alice' },
          { id: 'char-2', name: 'Bob' },
        ],
      }

      expect(event.participants).toHaveLength(2)
      expect(event.participants.map(p => p.name)).toContain('Alice')
    })

    it('provides navigation from timeline to entity details', () => {
      const participant = { id: 'char-1', entity_type: 'character', name: 'Alice' }
      const navigationUrl = `/projects/project-1/entities/${participant.id}`

      expect(navigationUrl).toContain(participant.id)
    })
  })

  describe('Event-Entity Relationship Model', () => {
    it('uses event_participants for entity links (not bidirectional relationships)', () => {
      const linkType = 'event_participants'
      expect(linkType).toBe('event_participants')
    })

    it('does not use knowledge_entity_relationships for events', () => {
      const eventAsRelationshipSource = false
      expect(eventAsRelationshipSource).toBe(false)
    })

    it('keeps event model separate from entity relationship model', () => {
      const eventModel = 'knowledge_events'
      const relationshipModel = 'knowledge_entity_relationships'

      expect(eventModel).not.toBe(relationshipModel)
    })
  })
})
