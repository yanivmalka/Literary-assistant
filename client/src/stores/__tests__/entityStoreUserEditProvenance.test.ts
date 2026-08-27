import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
}))

import { supabase } from '@/lib/supabase'
import { useEntityStore } from '../entityStore'

interface InsertCall { table: string; payload: Record<string, unknown> }

/**
 * Filter-aware chainable Supabase mock. Every builder method returns the
 * builder; `.eq`/`.is` accumulate a filter map; the builder is awaitable
 * (resolves `{ data: null, error: null }`); `.single()` / `.maybeSingle()`
 * resolve via `singleResolver(table, filters)`. `insert` payloads are captured.
 */
function installSupabaseMock(options: {
  inserts: InsertCall[]
  singleResolver?: (table: string, filters: Record<string, unknown>) => unknown
  authRejects?: boolean
}) {
  if (options.authRejects) {
    ;(supabase.auth.getUser as any).mockRejectedValue(new Error('auth network failure'))
  } else {
    ;(supabase.auth.getUser as any).mockResolvedValue({ data: { user: { id: 'user-1' } } })
  }

  ;(supabase.from as any).mockImplementation((table: string) => {
    const filters: Record<string, unknown> = {}
    const builder: any = {
      _table: table,
      select: () => builder,
      update: () => builder,
      delete: () => builder,
      order: () => builder,
      limit: () => builder,
      eq: (col: string, val: unknown) => { filters[col] = val; return builder },
      is: (col: string, val: unknown) => { filters[col] = val; return builder },
      insert: (payload: Record<string, unknown>) => {
        options.inserts.push({ table, payload })
        return builder
      },
      single: async () => ({ data: options.singleResolver?.(table, filters) ?? null, error: null }),
      maybeSingle: async () => ({ data: options.singleResolver?.(table, filters) ?? null, error: null }),
      then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
        resolve({ data: null, error: null }),
    }
    return builder
  })
}

function seedEntity(overrides: Record<string, unknown> = {}) {
  useEntityStore.setState({
    entities: [{
      id: 'ent-main',
      name: 'Leo Frost',
      entity_type: 'character',
      status: 'active',
      aliases: [],
      metadata: {},
      created_at: '',
      updated_at: '',
      structured_fields: { first_name: 'Leo', hair_color: 'black' },
      ...({ project_id: 'proj-1' } as Record<string, unknown>),
      ...overrides,
    } as any],
  })
}

function valueInserts(inserts: InsertCall[]) {
  return inserts.filter(i => i.table === 'knowledge_entity_values').map(i => i.payload)
}

describe('entityStore updateEntity user-edit provenance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useEntityStore.setState({ entities: [], selectedEntity: null })
  })

  it('Main direct edit: one source_type:user active row per changed field, branch_id null', async () => {
    seedEntity()
    const inserts: InsertCall[] = []
    installSupabaseMock({ inserts })

    const ok = await useEntityStore.getState().updateEntity('ent-main', {
      structured_fields: { first_name: 'Leo', hair_color: 'auburn' },
    })
    expect(ok).toBe(true)

    const rows = valueInserts(inserts)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      entity_id: 'ent-main',
      project_id: 'proj-1',
      branch_id: null,
      field_path: 'hair_color',
      source_type: 'user',
      value_status: 'active',
      created_by: 'user-1',
      value_json: { value: 'auburn' },
    })
  })

  it('Main direct edit: entity in store without project_id — id-lookup supplies project_id, store value is the baseline', async () => {
    // Real store Entity objects do not carry project_id.
    useEntityStore.setState({
      entities: [{
        id: 'ent-main',
        name: 'Leo Frost',
        entity_type: 'character',
        status: 'active',
        aliases: [],
        metadata: {},
        created_at: '',
        updated_at: '',
        structured_fields: { first_name: 'Leo', hair_color: 'black' },
      } as any],
    })
    const inserts: InsertCall[] = []
    installSupabaseMock({
      inserts,
      // The pre-update lookup returns a DIFFERENT structured_fields; the store
      // value must still be used as the diff baseline for a cache hit.
      singleResolver: (table) =>
        table === 'knowledge_entities'
          ? { project_id: 'proj-7', structured_fields: { first_name: 'Leo', hair_color: 'GREEN' } }
          : null,
    })

    await useEntityStore.getState().updateEntity('ent-main', {
      structured_fields: { first_name: 'Leo', hair_color: 'auburn' },
    })

    const rows = valueInserts(inserts)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      entity_id: 'ent-main',
      project_id: 'proj-7',
      field_path: 'hair_color',
      value_json: { value: 'auburn' },
      source_type: 'user',
    })
  })

  it('Main direct edit: a cleared field is stored as { value: null }, not SQL null', async () => {
    seedEntity({ structured_fields: { first_name: 'Leo', scars: 'a long scar' } })
    const inserts: InsertCall[] = []
    installSupabaseMock({ inserts })

    await useEntityStore.getState().updateEntity('ent-main', {
      structured_fields: { first_name: 'Leo', scars: null },
    })

    const rows = valueInserts(inserts)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ field_path: 'scars', source_type: 'user', value_json: { value: null } })
  })

  it('Main→Branch overlay edit: branch-scoped source_type:user row keyed on the Main entity id', async () => {
    seedEntity()
    const inserts: InsertCall[] = []
    installSupabaseMock({
      inserts,
      singleResolver: (table, filters) =>
        table === 'knowledge_entities' && filters.layer === 'main'
          ? {
              id: 'ent-main',
              project_id: 'proj-1',
              user_id: 'user-1',
              canonical_name: 'Leo Frost',
              entity_type: 'character',
              entity_types: ['character'],
              description: null,
              attributes: {},
              structured_fields: { first_name: 'Leo', hair_color: 'black' },
            }
          : null,
    })

    const ok = await useEntityStore.getState().updateEntity(
      'ent-main',
      { structured_fields: { first_name: 'Leo', hair_color: 'auburn' } },
      { branchId: 'branch-1', sourceEntityId: 'ent-main' },
    )
    expect(ok).toBe(true)

    const rows = valueInserts(inserts)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      entity_id: 'ent-main',
      branch_id: 'branch-1',
      field_path: 'hair_color',
      source_type: 'user',
      value_status: 'active',
    })
  })

  it('Branch-only entity edit: row is written with branch_id set to the branch', async () => {
    // Store holds the branch-only entity under its own id.
    useEntityStore.setState({
      entities: [{
        id: 'ent-branchonly',
        name: 'New Character',
        entity_type: 'character',
        status: 'active',
        aliases: [],
        metadata: {},
        created_at: '',
        updated_at: '',
        structured_fields: { first_name: 'Nomi', hair_color: 'black' },
      } as any],
    })
    const inserts: InsertCall[] = []
    installSupabaseMock({
      inserts,
      singleResolver: (table, filters) => {
        if (table !== 'knowledge_entities') return null
        if (filters.layer === 'main') return null // forces the branch-only path
        if (filters.layer === 'branch') {
          return {
            id: 'ent-branchonly',
            project_id: 'proj-1',
            structured_fields: { first_name: 'Nomi', hair_color: 'black' },
          }
        }
        return null
      },
    })

    const ok = await useEntityStore.getState().updateEntity(
      'ent-branchonly',
      { structured_fields: { first_name: 'Nomi', hair_color: 'auburn' } },
      { branchId: 'branch-1', sourceEntityId: 'ent-branchonly' },
    )
    expect(ok).toBe(true)

    const rows = valueInserts(inserts)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      entity_id: 'ent-branchonly',
      project_id: 'proj-1',
      branch_id: 'branch-1',
      field_path: 'hair_color',
      source_type: 'user',
    })
  })

  it('A3: an auth/provenance failure does not turn a successful entity update into a failure', async () => {
    seedEntity()
    const inserts: InsertCall[] = []
    installSupabaseMock({ inserts, authRejects: true })

    const ok = await useEntityStore.getState().updateEntity('ent-main', {
      structured_fields: { first_name: 'Leo', hair_color: 'auburn' },
    })

    expect(ok).toBe(true) // primary knowledge_entities update already succeeded
    expect(valueInserts(inserts)).toHaveLength(0) // provenance skipped, not fatal
  })

  it('A4: cache miss — provenance is still written using project_id + structured_fields fetched by id', async () => {
    // Entity is NOT in the store.
    const inserts: InsertCall[] = []
    installSupabaseMock({
      inserts,
      singleResolver: (table) =>
        table === 'knowledge_entities'
          ? { project_id: 'proj-9', structured_fields: { first_name: 'Leo', hair_color: 'black' } }
          : null,
    })

    const ok = await useEntityStore.getState().updateEntity('ent-missing', {
      structured_fields: { first_name: 'Leo', hair_color: 'auburn' },
    })
    expect(ok).toBe(true)

    const rows = valueInserts(inserts)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      entity_id: 'ent-missing',
      project_id: 'proj-9',
      branch_id: null,
      field_path: 'hair_color',
      source_type: 'user',
    })
  })

  it('does not write a value row when no structured field changed', async () => {
    seedEntity()
    const inserts: InsertCall[] = []
    installSupabaseMock({ inserts })

    await useEntityStore.getState().updateEntity('ent-main', {
      structured_fields: { first_name: 'Leo', hair_color: 'black' },
    })

    expect(valueInserts(inserts)).toHaveLength(0)
  })
})
