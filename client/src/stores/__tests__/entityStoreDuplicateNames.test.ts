import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
}))

import { supabase } from '@/lib/supabase'
import { useEntityStore } from '../entityStore'

describe('entityStore duplicate-name creation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useEntityStore.setState({ entities: [] })
    ;(supabase.auth.getUser as any).mockResolvedValue({ data: { user: { id: 'user-1' } } })
  })

  it('creates two distinct Main entities with the default name', async () => {
    const rows = [
      {
        id: 'uuid-a',
        canonical_name: 'דמות חדשה',
        entity_type: 'character',
        entity_types: ['character'],
        description: null,
        attributes: {},
        structured_fields: { name: 'דמות חדשה' },
        source: 'user',
        review_status: 'confirmed',
        created_at: '2026-08-20T00:00:00.000Z',
        updated_at: '2026-08-20T00:00:00.000Z',
      },
      {
        id: 'uuid-b',
        canonical_name: 'דמות חדשה',
        entity_type: 'character',
        entity_types: ['character'],
        description: null,
        attributes: {},
        structured_fields: { name: 'דמות חדשה' },
        source: 'user',
        review_status: 'confirmed',
        created_at: '2026-08-20T00:00:01.000Z',
        updated_at: '2026-08-20T00:00:01.000Z',
      },
    ]

    let insertIndex = 0
    ;(supabase.from as any).mockImplementation((table: string) => {
      expect(table).toBe('knowledge_entities')
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: rows[insertIndex++], error: null }),
          }),
        }),
      }
    })

    const first = await useEntityStore.getState().createEntity('project-1', 'character', {})
    const second = await useEntityStore.getState().createEntity('project-1', 'character', {})

    expect(first?.id).toBe('uuid-a')
    expect(second?.id).toBe('uuid-b')
    expect(first?.id).not.toBe(second?.id)
    expect(first?.name).toBe('דמות חדשה')
    expect(second?.name).toBe('דמות חדשה')
    expect(useEntityStore.getState().entities.map(entity => entity.id)).toEqual(['uuid-a', 'uuid-b'])
  })
})
