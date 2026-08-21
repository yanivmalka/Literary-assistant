import { describe, expect, it } from 'vitest'
import {
  normalizeEntities,
  type ExtractedEntity,
} from '../../../../supabase/functions/extract-knowledge/normalization.ts'
import {
  parseExtractionJson,
  validateExtractionMode,
} from '../../../../supabase/functions/extract-knowledge/testable-pipeline.ts'
import {
  applyEntityOverrides,
  resolveExtractionCandidate,
} from '../../../../supabase/functions/_shared/entity-resolution.ts'
import { normalizeKey, stripNikud } from '../../../../supabase/functions/_shared/rules/normalization.ts'
import { shouldFilterEntity } from '../../../../supabase/functions/_shared/rules/filtering.ts'
import { deduplicateBatchEntities } from '../../../../supabase/functions/_shared/entity-batch.ts'
import { extractionFixture, chunkFixture } from './fixtures/entityExtractionFixtures'
import { FakeEntityRepository } from './fakeEntityRepository'

describe('Entity Extraction automatic checks (in-memory fixtures)', () => {
  it('[character] normalizes nikud, fields, aliases and provenance', () => {
    const [character] = normalizeEntities({ characters: [extractionFixture.characters[0]] }, chunkFixture)

    expect(character.entity_type).toBe('character')
    expect(character.canonical_name).toBe('ליאו פרוסט')
    expect(character.aliases).toContain('ליאו')
    expect(character.structured_fields).toMatchObject({ age: '25', hair_color: 'שחור', eye_color: 'כחול' })
    expect(character.chunk_ids).toEqual(['chunk-character'])
    expect(character.page_numbers).toEqual([10])
    expect(character.field_confidence?.age).toBeGreaterThan(0.7)
  })

  it('[location] keeps a named location and rejects generic locations', () => {
    const [location] = normalizeEntities({ locations: [extractionFixture.locations[0]] }, chunkFixture)

    expect(location.entity_type).toBe('location')
    expect(location.canonical_name).toBe('יער אירויין')
    expect(location.structured_fields.location_type).toBe('יער')
    expect(shouldFilterEntity({ canonical_name: 'יער', entity_type: 'location' })).toBe(true)
  })

  it('[object] retains significant object fields', () => {
    const [object] = normalizeEntities({ objects: [extractionFixture.objects[0]] }, chunkFixture)

    expect(object.entity_type).toBe('object')
    expect(object.structured_fields).toMatchObject({
      object_type: 'חפץ קסום',
      materials: 'כסף',
      special_properties: 'מפיק אור כחול',
    })
  })

  it('[ability] creates a physical ability with the physical default', () => {
    const [ability] = normalizeEntities({ abilities: [extractionFixture.abilities[0]] }, chunkFixture)

    expect(ability.entity_type).toBe('ability')
    expect(ability.structured_fields.ability_type).toBe('physical')
    expect(ability.structured_fields.users).toBe('ליאו פרוסט')
  })

  it('[magic_ability] keeps magical abilities separate from physical abilities', () => {
    const [ability] = normalizeEntities({ magic_abilities: [extractionFixture.magic_abilities[0]] }, chunkFixture)

    expect(ability.entity_type).toBe('magic_ability')
    expect(ability.structured_fields.ability_type).toBe('magical')
    expect(ability.structured_fields.power_level).toBe('גבוה')
  })

  it('[event] parses event payloads and stores them only through the branch fake repository', () => {
    const parsed = parseExtractionJson<typeof extractionFixture>(JSON.stringify(extractionFixture))
    expect(parsed?.events[0]).toMatchObject({ name: 'קרב ההרים', participants: ['ליאו פרוסט'] })

    const repository = new FakeEntityRepository()
    repository.saveEvent({ name: parsed!.events[0].name!, branch_id: 'branch-test' })
    expect(repository.events).toHaveLength(1)
    expect(repository.events[0].branch_id).toBe('branch-test')
  })

  it('[organization] normalizes members without contacting a database', () => {
    const [organization] = normalizeEntities({ organizations: [extractionFixture.organizations[0]] }, chunkFixture)

    expect(organization.entity_type).toBe('organization')
    expect(organization.structured_fields.users).toBe('ליאו פרוסט')
  })

  it('[JSON parsing] accepts fenced JSON and JSON surrounded by model text', () => {
    expect(parseExtractionJson<{ characters: unknown[] }>('```json\n{"characters": []}\n```')).toEqual({ characters: [] })
    expect(parseExtractionJson<{ locations: unknown[] }>('Model response: {"locations": []} תודה')).toEqual({ locations: [] })
    expect(parseExtractionJson('{not valid json')).toBeNull()
  })

  it('[normalization] strips nikud and ignores the Hebrew definite article in keys', () => {
    expect(stripNikud('אָרוֹן')).toBe('ארון')
    expect(normalizeKey('המישור הארצי')).toBe(normalizeKey('מישור הארצי'))
  })

  it('[validation] identifies exactly which Main/Branch mode is invalid', () => {
    expect(validateExtractionMode({ extraction_mode: 'bootstrap', target_branch_id: 'branch-1' })).toEqual({
      ok: false,
      error: "extraction_mode='bootstrap' cannot specify target_branch_id.",
    })
    expect(validateExtractionMode({ extraction_mode: 'branch' })).toEqual({
      ok: false,
      error: "extraction_mode='branch' requires target_branch_id.",
    })
    expect(validateExtractionMode({ extraction_mode: 'branch', target_branch_id: 'branch-1' })).toEqual({
      ok: true,
      mode: 'branch',
      branchId: 'branch-1',
    })
    expect(validateExtractionMode({ extraction_mode: 'bootstrap' })).toEqual({
      ok: true,
      mode: 'bootstrap',
      branchId: null,
    })
  })

  it('[deduplication] merges same-type observations but never crosses entity types', () => {
    const base = {
      canonical_name: 'Aron',
      entity_type: 'character',
      entity_types: ['character'],
      description: null,
      attributes: {},
      structured_fields: { age: null },
      aliases: [],
      evidence: [],
      chunk_positions: [],
    }
    const result = deduplicateBatchEntities([
      base,
      { ...base, canonical_name: 'aron', structured_fields: { age: '30' } },
      { ...base, entity_type: 'location', entity_types: ['location'] },
    ])

    expect(result).toHaveLength(2)
    expect(result.find((entity) => entity.entity_type === 'character')?.structured_fields.age).toBe('30')
    expect(result.find((entity) => entity.entity_type === 'location')).toBeDefined()
  })

  it('[normalization deduplication] merges a short name into the longer canonical name', () => {
    const result = normalizeEntities({
      characters: [
        { name: 'ליאו', chunk_positions: [0], description: 'קוסם צעיר' },
        { name: 'ליאו פרוסט', aliases: ['ליאו'], chunk_positions: [1], description: 'קוסם צעיר' },
      ],
    }, chunkFixture)

    expect(result).toHaveLength(1)
    expect(result[0].canonical_name).toBe('ליאו פרוסט')
    expect(result[0].aliases).toContain('ליאו')
    expect(result[0].chunk_positions).toEqual([1, 0])
  })

  it('[main/branch] prefers Branch identity, overlays Main values, and writes only to the fake repository', () => {
    const main = {
      id: 'main-1',
      canonical_name: 'ליאו פרוסט',
      entity_type: 'character',
      description: 'Main description',
      structured_fields: { age: '25' },
      attributes: {},
    }
    const branch = {
      id: 'branch-1',
      canonical_name: 'ליאו פרוסט',
      entity_type: 'character',
      description: 'Branch description',
      structured_fields: { age: '30' },
      attributes: {},
    }
    const input = { canonical_name: 'ליאו פרוסט', entity_type: 'character', description: 'Branch description' }

    expect(resolveExtractionCandidate(input, [branch], [main])?.id).toBe('branch-1')
    expect(applyEntityOverrides(main, { 'structured_fields.age': '31' }).structured_fields?.age).toBe('31')

    const repository = new FakeEntityRepository()
    repository.saveEntity({
      canonical_name: 'דמות חדשה',
      entity_type: 'character',
      layer: 'branch',
      branch_id: 'branch-test',
    })
    repository.saveRelationship({
      source_entity_id: 'branch-1',
      target_entity_id: 'ability-1',
      relationship_type: 'has_ability',
      branch_id: 'branch-test',
    })

    expect(repository.entities[0]).toMatchObject({ layer: 'branch', branch_id: 'branch-test' })
    expect(repository.relationships[0].branch_id).toBe('branch-test')
    expect(repository.entities.some((entity) => entity.layer === 'main')).toBe(false)
  })

  it('[repository safety] proves the fixture suite has no Supabase write path', () => {
    const repository = new FakeEntityRepository()
    const entity: ExtractedEntity = { name: 'Test entity' }
    repository.saveEntity({
      canonical_name: entity.name,
      entity_type: 'character',
      layer: 'main',
      branch_id: null,
    })

    expect(repository.writes).toBe(1)
    expect(repository.entities[0].id).toMatch(/^fake-entity-/)
  })
})
