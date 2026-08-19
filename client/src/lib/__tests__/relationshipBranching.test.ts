import { describe, expect, it } from 'vitest'
import {
  INITIAL_RELATIONSHIP_TYPES,
  buildBranchRelationshipRecord,
  buildRelationshipReviewUpdate,
  getEffectiveBranchRelationships,
  validateRelationshipType,
} from '../extractionBranching'

describe('Task 5: branch-scoped relationships', () => {
  const mainRelationship = {
    id: 'main-rel-1',
    branch_id: null,
    source_entity_id: 'main-character',
    target_entity_id: 'main-object',
    relationship_type: 'owns',
    operation: 'add' as const,
    review_status: 'approved' as const,
    base_exists: true,
  }

  it('supports the initial relationship vocabulary', () => {
    expect(INITIAL_RELATIONSHIP_TYPES).toEqual([
      'owns',
      'uses',
      'located_in',
      'knows',
      'parent_of',
      'involves',
      'occurs_at',
      'contained_in',
    ])
    expect(() => validateRelationshipType('owns')).not.toThrow()
    expect(() => validateRelationshipType('unknown')).toThrow('Unsupported relationship type')
  })

  it('builds an Add proposal in Branch scope without writing Main', () => {
    const proposal = buildBranchRelationshipRecord({
      projectId: 'project-1',
      sourceEntityId: 'main-character',
      targetEntityId: 'branch-object',
      relationshipType: 'owns',
      branchId: 'branch-1',
      baseExists: false,
    })

    expect(proposal).toMatchObject({
      project_id: 'project-1',
      source_entity_id: 'main-character',
      target_entity_id: 'branch-object',
      branch_id: 'branch-1',
      operation: 'add',
      review_status: 'pending',
      base_exists: false,
    })
    expect(proposal.branch_id).not.toBeNull()
    expect(proposal).not.toHaveProperty('main_entity_id')
  })

  it('builds a Remove tombstone for an existing Main relationship', () => {
    const proposal = buildBranchRelationshipRecord({
      projectId: 'project-1',
      sourceEntityId: 'main-character',
      targetEntityId: 'main-object',
      relationshipType: 'owns',
      branchId: 'branch-1',
      operation: 'remove',
      baseExists: true,
    })

    expect(proposal).toMatchObject({
      branch_id: 'branch-1',
      operation: 'remove',
      review_status: 'pending',
      base_exists: true,
    })
  })

  it('supports independent Approve and Reject review updates', () => {
    expect(buildRelationshipReviewUpdate('approved')).toEqual({ review_status: 'approved' })
    expect(buildRelationshipReviewUpdate('rejected')).toEqual({ review_status: 'rejected' })
  })

  it('does not change the effective Main graph before approval', () => {
    const pendingAdd = buildBranchRelationshipRecord({
      projectId: 'project-1',
      sourceEntityId: 'new-character',
      targetEntityId: 'branch-ability',
      relationshipType: 'uses',
      branchId: 'branch-1',
      baseExists: false,
    })
    const pendingRemove = buildBranchRelationshipRecord({
      projectId: 'project-1',
      sourceEntityId: 'main-character',
      targetEntityId: 'main-object',
      relationshipType: 'owns',
      branchId: 'branch-1',
      operation: 'remove',
      baseExists: true,
    })

    const effective = getEffectiveBranchRelationships(
      [mainRelationship],
      [pendingAdd, pendingRemove],
      'branch-1',
    )

    expect(effective).toEqual([mainRelationship])
  })

  it('applies approved Add and Remove independently', () => {
    const approvedAdd = {
      ...buildBranchRelationshipRecord({
        projectId: 'project-1',
        sourceEntityId: 'main-character',
        targetEntityId: 'branch-ability',
        relationshipType: 'uses',
        branchId: 'branch-1',
        baseExists: false,
      }),
      review_status: 'approved' as const,
    }
    const approvedRemove = {
      ...buildBranchRelationshipRecord({
        projectId: 'project-1',
        sourceEntityId: 'main-character',
        targetEntityId: 'main-object',
        relationshipType: 'owns',
        branchId: 'branch-1',
        operation: 'remove',
        baseExists: true,
      }),
      review_status: 'approved' as const,
    }

    const effective = getEffectiveBranchRelationships(
      [mainRelationship],
      [approvedAdd, approvedRemove],
      'branch-1',
    )

    expect(effective).toHaveLength(1)
    expect(effective[0]).toMatchObject({ target_entity_id: 'branch-ability', relationship_type: 'uses' })
    expect(effective).not.toContainEqual(mainRelationship)
  })

  it('keeps Branches isolated and allows Main-to-Branch-only endpoints', () => {
    const branchOne = {
      ...buildBranchRelationshipRecord({
        projectId: 'project-1',
        sourceEntityId: 'main-character',
        targetEntityId: 'branch-only-object',
        relationshipType: 'owns',
        branchId: 'branch-1',
        baseExists: false,
      }),
      review_status: 'approved' as const,
    }
    const branchTwo = {
      ...branchOne,
      branch_id: 'branch-2',
    }

    expect(getEffectiveBranchRelationships([], [branchOne], 'branch-1')).toEqual([branchOne])
    expect(getEffectiveBranchRelationships([], [branchOne], 'branch-2')).toEqual([])
    expect(getEffectiveBranchRelationships([], [branchTwo], 'branch-2')).toEqual([branchTwo])
    expect(branchOne.target_entity_id).toBe('branch-only-object')
    expect(branchOne.base_exists).toBe(false)
  })

  it('rejects missing Branch context for relationship proposals', () => {
    expect(() => buildBranchRelationshipRecord({
      projectId: 'project-1',
      sourceEntityId: 'main-character',
      targetEntityId: 'main-object',
      relationshipType: 'owns',
      branchId: '',
      baseExists: true,
    })).toThrow('No active branch')
  })
})
