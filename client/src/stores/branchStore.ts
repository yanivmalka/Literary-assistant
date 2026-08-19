import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import i18n from '@/i18n'

// ============================================
// Types
// ============================================

export interface Branch {
  id: string
  project_id: string
  user_id: string
  name: string
  status: 'active' | 'archived' | 'merged'
  is_current: boolean
  created_at: string
  updated_at: string
}

/**
 * BranchEntity represents a potential override or branch-only entity.
 * MVP Overlay Model: Does NOT store full entity data.
 * 
 * For an Entity override in Branch:
 * - source_entity_id = Main Entity ID (the entity being overridden)
 * - entity_id = Main Entity ID (same as source_entity_id)
 * - overrides = JSONB with only changed fields (delta, not full copy)
 * - base_values = JSONB snapshot of Main fields when override was created
 * 
 * For a Branch-only Entity:
 * - source_entity_id = NULL
 * - entity_id = Branch Entity ID (new entity in this branch)
 * - overrides = full entity data (since no parent to delta from)
 * - base_values = {} (no parent to compare against)
 * 
 * DEPRECATED (legacy Snapshot data): canonical_name, description, attributes, entity_type, entity_types
 * These are kept for backward compatibility but should not be used in new code.
 */
export interface BranchEntity {
  id: string
  branch_id: string
  project_id: string
  user_id: string
  
  // Overlay model references
  source_entity_id: string | null  // Main Entity ID if override; NULL if branch-only
  entity_id: string | null         // Actual Entity ID (Main or Branch)
  
  // Overlay/Patch data
  overrides: Record<string, unknown>  // Only changed fields (patches)
  base_values: Record<string, unknown> // Main entity field values at override creation time
  rejected_fields: string[]            // Fields user rejected in suggestions
  
  // Metadata
  is_modified: boolean
  modified_fields: string[]
  created_at: string
  updated_at: string

  // DEPRECATED: Snapshot fields (legacy, for backward compatibility)
  // Do not populate in new code; kept to avoid breaking existing queries
  canonical_name?: string
  entity_type?: string
  entity_types?: string[]
  description?: string | null
  attributes?: Record<string, unknown>
}

export interface MainEntity {
  id: string
  canonical_name: string
  entity_type: string
  entity_types: string[]
  description: string | null
  attributes: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface FieldDiff {
  field: string
  mainValue: unknown
  branchValue: unknown
  changed: boolean
}

export interface EntityComparison {
  sourceEntityId: string
  entityName: string
  entityType: string
  diffs: FieldDiff[]
  hasChanges: boolean
}

// ============================================
// Store
// ============================================

interface BranchState {
  // State
  branches: Branch[]
  currentBranch: Branch | null
  branchEntities: BranchEntity[]
  mainEntities: MainEntity[]
  comparisons: EntityComparison[]
  loading: boolean
  error: string | null

  // Actions
  fetchBranches: (projectId: string) => Promise<void>
  fetchCurrentBranch: (projectId: string) => Promise<Branch | null>
  createBranch: (projectId: string, name?: string) => Promise<Branch | null>
  fetchBranchEntities: (branchId: string) => Promise<void>
  fetchMainEntities: (projectId: string) => Promise<void>
  updateBranchEntity: (branchEntityId: string, updates: Partial<Pick<BranchEntity, 'canonical_name' | 'description' | 'attributes'>>) => Promise<void>
  compareEntities: (branchId: string, projectId: string) => Promise<void>
  transferFieldToMain: (sourceEntityId: string, field: string, branchValue: unknown) => Promise<void>
  transferAllToMain: (sourceEntityId: string) => Promise<void>
  archiveBranch: (branchId: string) => Promise<void>
  clearError: () => void
}

export const useBranchStore = create<BranchState>((set, get) => ({
  branches: [],
  currentBranch: null,
  branchEntities: [],
  mainEntities: [],
  comparisons: [],
  loading: false,
  error: null,

  clearError: () => set({ error: null }),

  // ==============================
  // Fetch all branches for a project
  // ==============================
  fetchBranches: async (projectId: string) => {
    try {
      const { data, error } = await supabase
        .from('knowledge_branches')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Failed to fetch branches:', error)
        set({ error: error.message })
        return
      }

      const branches = (data || []) as Branch[]
      const current = branches.find(b => b.is_current && b.status === 'active') || null
      set({ branches, currentBranch: current })
    } catch (err) {
      console.error('Failed to fetch branches:', err)
    }
  },

  // ==============================
  // Fetch the current active branch
  // ==============================
  fetchCurrentBranch: async (projectId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null

      const { data, error } = await supabase
        .from('knowledge_branches')
        .select('*')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .eq('is_current', true)
        .eq('status', 'active')
        .maybeSingle()

      if (error) {
        console.error('Failed to fetch current branch:', error)
        return null
      }

      const branch = data as Branch | null
      set({ currentBranch: branch })
      return branch
    } catch (err) {
      console.error('Failed to fetch current branch:', err)
      return null
    }
  },

  // ==============================
  // Create a new branch (Overlay model)
  // ==============================
  // MVP Change: Branch creation NO LONGER copies all Main entities.
  // New branches are created empty. Overlays are created only when:
  // - An existing entity is modified in the branch, or
  // - A new entity is created in the branch, or
  // - An operation explicitly creates an overlay.
  createBranch: async (projectId: string, name?: string) => {
    set({ loading: true, error: null })
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        set({ loading: false, error: 'Not authenticated' })
        return null
      }

      // Create the branch record (metadata only, no entity copies)
      const branchName = name || `${i18n.t('ui.branch.branch')} ${new Date().toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-US')}`
      const { data: branch, error: branchError } = await supabase
        .from('knowledge_branches')
        .insert({
          project_id: projectId,
          user_id: user.id,
          name: branchName,
          status: 'active',
          is_current: true,
        })
        .select('*')
        .single()

      if (branchError || !branch) {
        console.error('Failed to create branch:', branchError)
        set({ loading: false, error: branchError?.message || 'Failed to create branch' })
        return null
      }

      // That's it! No entity copying. Branch is created empty.
      // Overlays will be created only when needed (on modification or extraction).

      // Refresh state
      await get().fetchBranches(projectId)

      set({ loading: false })
      return branch as Branch
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      set({ loading: false, error: msg })
      return null
    }
  },

  // ==============================
  // Fetch branch entities (Overlay model)
  // ==============================
  // Fetches only entities that have overlays in this branch.
  // Does NOT fetch all Main entities (unlike old Snapshot model).
  // Returns overlays with source_entity_id, entity_id, overrides, base_values.
  fetchBranchEntities: async (branchId: string) => {
    try {
      const { data, error } = await supabase
        .from('knowledge_branch_entities')
        .select('*')
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Failed to fetch branch entities:', error)
        set({ error: error.message })
        return
      }

      set({ branchEntities: (data || []) as BranchEntity[] })
    } catch (err) {
      console.error('Failed to fetch branch entities:', err)
    }
  },

  // ==============================
  // Fetch Main entities (for comparison)
  // ==============================
  fetchMainEntities: async (projectId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('knowledge_entities')
        .select('id, canonical_name, entity_type, entity_types, description, attributes, created_at, updated_at')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .eq('layer', 'main')
        .order('canonical_name')

      if (error) {
        console.error('Failed to fetch main entities:', error)
        return
      }

      set({ mainEntities: (data || []) as MainEntity[] })
    } catch (err) {
      console.error('Failed to fetch main entities:', err)
    }
  },

  // ==============================
  // Update a branch entity overlay (Overlay model)
  // ==============================
  // DEPRECATED: This method is kept for backward compatibility with Snapshot model.
  // For MVP Overlay model, use createOrUpdateOverlay() in Task 3.
  // This method updates old Snapshot-style data if it exists.
  updateBranchEntity: async (branchEntityId: string, updates) => {
    try {
      // Get current branch entity overlay
      const current = get().branchEntities.find(e => e.id === branchEntityId)
      if (!current) return

      // Get the corresponding main entity to compare
      const mainEntity = get().mainEntities.find(e => e.id === current.source_entity_id)

      // Determine modified fields (legacy logic)
      const modifiedFields = new Set(current.modified_fields || [])

      if (updates.canonical_name !== undefined && mainEntity) {
        if (updates.canonical_name !== mainEntity.canonical_name) {
          modifiedFields.add('canonical_name')
        } else {
          modifiedFields.delete('canonical_name')
        }
      }
      if (updates.description !== undefined && mainEntity) {
        if (updates.description !== mainEntity.description) {
          modifiedFields.add('description')
        } else {
          modifiedFields.delete('description')
        }
      }
      if (updates.attributes !== undefined && mainEntity) {
        // Compare each attribute key
        const mainAttrs = (mainEntity.attributes || {}) as Record<string, unknown>
        const newAttrs = updates.attributes as Record<string, unknown>
        const allKeys = new Set([...Object.keys(mainAttrs), ...Object.keys(newAttrs)])
        for (const key of allKeys) {
          const attrField = `attributes.${key}`
          if (JSON.stringify(mainAttrs[key]) !== JSON.stringify(newAttrs[key])) {
            modifiedFields.add(attrField)
          } else {
            modifiedFields.delete(attrField)
          }
        }
      }

      const isModified = modifiedFields.size > 0

      const { error } = await supabase
        .from('knowledge_branch_entities')
        .update({
          ...updates,
          is_modified: isModified,
          modified_fields: Array.from(modifiedFields),
          updated_at: new Date().toISOString(),
        })
        .eq('id', branchEntityId)

      if (error) {
        console.error('Failed to update branch entity:', error)
        set({ error: error.message })
        return
      }

      // Update local state
      set({
        branchEntities: get().branchEntities.map(e =>
          e.id === branchEntityId
            ? { ...e, ...updates, is_modified: isModified, modified_fields: Array.from(modifiedFields), updated_at: new Date().toISOString() }
            : e
        ),
      })
    } catch (err) {
      console.error('Failed to update branch entity:', err)
    }
  },

  // ==============================
  // Compare Main vs Branch (field-level diff)
  // ==============================
  // DEPRECATED: This method works with old Snapshot model.
  // For MVP Overlay model, comparison will be implemented in Task 3.
  // Kept for backward compatibility.
  compareEntities: async (branchId: string, projectId: string) => {
    set({ loading: true })
    try {
      // Ensure we have both sets
      await get().fetchMainEntities(projectId)
      await get().fetchBranchEntities(branchId)

      const mainEntities = get().mainEntities
      const branchEntities = get().branchEntities

      const comparisons: EntityComparison[] = []

      for (const branchEntity of branchEntities) {
        // Skip if no source_entity_id (branch-only entity with no comparison needed)
        if (!branchEntity.source_entity_id) continue

        const mainEntity = mainEntities.find(m => m.id === branchEntity.source_entity_id)
        if (!mainEntity) continue

        const diffs: FieldDiff[] = []

        // Compare canonical_name
        diffs.push({
          field: 'canonical_name',
          mainValue: mainEntity.canonical_name,
          branchValue: branchEntity.canonical_name || mainEntity.canonical_name,
          changed: mainEntity.canonical_name !== (branchEntity.canonical_name || mainEntity.canonical_name),
        })

        // Compare description
        diffs.push({
          field: 'description',
          mainValue: mainEntity.description,
          branchValue: branchEntity.description || mainEntity.description,
          changed: (mainEntity.description || '') !== (branchEntity.description || mainEntity.description || ''),
        })

        // Compare attributes (field by field)
        const mainAttrs = (mainEntity.attributes || {}) as Record<string, unknown>
        const branchAttrs = (branchEntity.attributes || {}) as Record<string, unknown>
        const allAttrKeys = new Set([...Object.keys(mainAttrs), ...Object.keys(branchAttrs)])

        for (const key of allAttrKeys) {
          diffs.push({
            field: `attributes.${key}`,
            mainValue: mainAttrs[key] ?? null,
            branchValue: branchAttrs[key] ?? null,
            changed: JSON.stringify(mainAttrs[key] ?? null) !== JSON.stringify(branchAttrs[key] ?? null),
          })
        }

        const hasChanges = diffs.some(d => d.changed)
        comparisons.push({
          sourceEntityId: branchEntity.source_entity_id,
          entityName: branchEntity.canonical_name || mainEntity.canonical_name,
          entityType: branchEntity.entity_type || mainEntity.entity_type,
          diffs,
          hasChanges,
        })
      }

      set({ comparisons, loading: false })
    } catch (err) {
      console.error('Failed to compare entities:', err)
      set({ loading: false })
    }
  },

  // ==============================
  // Transfer a single field from Branch to Main
  // ==============================
  transferFieldToMain: async (sourceEntityId: string, field: string, branchValue: unknown) => {
    try {
      let updatePayload: Record<string, unknown> = {}

      if (field === 'canonical_name') {
        updatePayload = { canonical_name: branchValue }
      } else if (field === 'description') {
        updatePayload = { description: branchValue }
      } else if (field.startsWith('attributes.')) {
        // Need to update a specific attribute key
        const attrKey = field.replace('attributes.', '')
        const { data: current } = await supabase
          .from('knowledge_entities')
          .select('attributes')
          .eq('id', sourceEntityId)
          .single()

        const currentAttrs = (current?.attributes || {}) as Record<string, unknown>
        currentAttrs[attrKey] = branchValue
        updatePayload = { attributes: currentAttrs }
      }

      updatePayload.updated_at = new Date().toISOString()

      const { error } = await supabase
        .from('knowledge_entities')
        .update(updatePayload)
        .eq('id', sourceEntityId)

      if (error) {
        console.error('Failed to transfer field to main:', error)
        set({ error: error.message })
        return
      }

      // Update the branch entity to reflect it's no longer different for this field
      const branchEntity = get().branchEntities.find(e => e.source_entity_id === sourceEntityId)
      if (branchEntity) {
        const newModifiedFields = branchEntity.modified_fields.filter(f => f !== field)
        await supabase
          .from('knowledge_branch_entities')
          .update({
            is_modified: newModifiedFields.length > 0,
            modified_fields: newModifiedFields,
            updated_at: new Date().toISOString(),
          })
          .eq('id', branchEntity.id)
      }

      // Update local main entities state
      set({
        mainEntities: get().mainEntities.map(e => {
          if (e.id !== sourceEntityId) return e
          if (field === 'canonical_name') return { ...e, canonical_name: branchValue as string }
          if (field === 'description') return { ...e, description: branchValue as string | null }
          if (field.startsWith('attributes.')) {
            const attrKey = field.replace('attributes.', '')
            const newAttrs = { ...(e.attributes || {}), [attrKey]: branchValue }
            return { ...e, attributes: newAttrs }
          }
          return e
        }),
      })

      // Refresh comparisons
      const { currentBranch } = get()
      if (currentBranch) {
        const projectId = currentBranch.project_id
        await get().compareEntities(currentBranch.id, projectId)
      }
    } catch (err) {
      console.error('Failed to transfer field:', err)
    }
  },

  // ==============================
  // Transfer all changed fields for an entity from Branch to Main
  // ==============================
  transferAllToMain: async (sourceEntityId: string) => {
    const comparison = get().comparisons.find(c => c.sourceEntityId === sourceEntityId)
    if (!comparison) return

    const changedDiffs = comparison.diffs.filter(d => d.changed)
    for (const diff of changedDiffs) {
      await get().transferFieldToMain(sourceEntityId, diff.field, diff.branchValue)
    }
  },

  // ==============================
  // Archive a branch (deactivate without deleting)
  // ==============================
  archiveBranch: async (branchId: string) => {
    try {
      const { error } = await supabase
        .from('knowledge_branches')
        .update({ status: 'archived', is_current: false, updated_at: new Date().toISOString() })
        .eq('id', branchId)

      if (error) {
        console.error('Failed to archive branch:', error)
        set({ error: error.message })
        return
      }

      set({
        currentBranch: null,
        branchEntities: [],
        comparisons: [],
      })
    } catch (err) {
      console.error('Failed to archive branch:', err)
    }
  },
}))
