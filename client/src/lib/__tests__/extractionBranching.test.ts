import { describe, expect, it } from 'vitest'
import {
  buildBranchEntityAliasRecord,
  buildBranchEntityMentionRecord,
  buildBranchEntityRecord,
  buildEntityOverlayRecord,
  buildExtractionRequest,
  buildRawExtractionRecord,
  validateBranchContext,
} from '../extractionBranching'

describe('AI extraction branch routing', () => {
  it('rejects extraction when there is no active branch', () => {
    expect(() => validateBranchContext(null)).toThrow('No active branch')
    expect(() => validateBranchContext(undefined)).toThrow('AI is not permitted to modify Main directly')
    expect(() => buildExtractionRequest('v1', 'p1', 'd1', 'u1', '', 0, 2)).toThrow('No active branch')
  })

  it('requires and forwards the active branch in every extraction request', () => {
    expect(buildExtractionRequest('v1', 'p1', 'd1', 'u1', 'branch-1', 0, 2)).toEqual({
      version_id: 'v1',
      project_id: 'p1',
      document_id: 'd1',
      user_id: 'u1',
      target_branch_id: 'branch-1',
      offset: 0,
      limit: 2,
    })
  })

  it('creates a new AI entity as Branch-only, never Main', () => {
    const row = buildBranchEntityRecord('p1', 'u1', 'branch-1', {
      canonical_name: 'New Character',
      entity_type: 'character',
      description: 'Found by AI',
    })

    expect(row).toMatchObject({
      project_id: 'p1',
      user_id: 'u1',
      layer: 'branch',
      branch_id: 'branch-1',
      source: 'ai',
    })
    expect(row.layer).not.toBe('main')
    expect(row.branch_id).not.toBeNull()
  })

  it('creates an override for an existing Main entity with base values', () => {
    const overlay = buildEntityOverlayRecord(
      'branch-1',
      'main-entity-1',
      {
        description: 'Branch description',
        'structured_fields.age': '30',
      },
      {
        description: 'Main description',
        'structured_fields.age': '25',
      },
    )

    expect(overlay).toMatchObject({
      branch_id: 'branch-1',
      source_entity_id: 'main-entity-1',
      entity_id: 'main-entity-1',
      overrides: {
        description: 'Branch description',
        'structured_fields.age': '30',
      },
      base_values: {
        description: 'Main description',
        'structured_fields.age': '25',
      },
      is_modified: true,
    })
    expect(overlay).not.toHaveProperty('canonical_name')
  })

  it('routes raw extraction records to the active Branch', () => {
    const row = buildRawExtractionRecord('p1', 'd1', 'v1', 'u1', 'branch-1', {
      model: 'test-model',
      raw_response: { entities: [] },
    })

    expect(row).toMatchObject({
      project_id: 'p1',
      document_id: 'd1',
      version_id: 'v1',
      user_id: 'u1',
      branch_id: 'branch-1',
    })
    expect(() => buildRawExtractionRecord('p1', 'd1', 'v1', 'u1', '', {})).toThrow('No active branch')
  })

  it('routes AI evidence and aliases to the active Branch', () => {
    expect(buildBranchEntityMentionRecord('entity-1', 4, 'Evidence text', 'branch-1')).toEqual({
      entity_id: 'entity-1',
      chunk_position: 4,
      evidence: 'Evidence text',
      branch_id: 'branch-1',
    })
    expect(buildBranchEntityAliasRecord('entity-1', 'The Hero', 'branch-1')).toEqual({
      entity_id: 'entity-1',
      alias: 'The Hero',
      branch_id: 'branch-1',
    })
    expect(() => buildBranchEntityMentionRecord('entity-1', 4, 'Evidence text', '')).toThrow('No active branch')
    expect(() => buildBranchEntityAliasRecord('entity-1', 'The Hero', undefined as unknown as string)).toThrow('No active branch')
  })

  it('keeps two Branches isolated in every generated record', () => {
    const branchOneEntity = buildBranchEntityRecord('p1', 'u1', 'branch-1', {
      canonical_name: 'Same Name',
      entity_type: 'character',
    })
    const branchTwoEntity = buildBranchEntityRecord('p1', 'u1', 'branch-2', {
      canonical_name: 'Same Name',
      entity_type: 'character',
    })
    const branchOneMention = buildBranchEntityMentionRecord('entity-1', 1, 'same evidence', 'branch-1')
    const branchTwoMention = buildBranchEntityMentionRecord('entity-1', 1, 'same evidence', 'branch-2')

    expect(branchOneEntity.branch_id).toBe('branch-1')
    expect(branchTwoEntity.branch_id).toBe('branch-2')
    expect(branchOneEntity.branch_id).not.toBe(branchTwoEntity.branch_id)
    expect(branchOneMention.branch_id).not.toBe(branchTwoMention.branch_id)
  })
})
