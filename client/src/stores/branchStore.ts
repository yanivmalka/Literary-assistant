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

export interface BranchEntity {
  id: string
  branch_id: string
  source_entity_id: string
  project_id: string
  user_id: string
  canonical_name: string
  entity_type: string
  entity_types: string[]
  description: string | null
  attributes: Record<string, unknown>
  is_modified: boolean
  modified_fields: string[]
  created_at: string
  updated_at: string
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
  // Create a new branch (copies Main entities into branch)
  // ==============================
  createBranch: async (projectId: string, name?: string) => {
    set({ loading: true, error: null })
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        set({ loading: false, error: 'Not authenticated' })
        return null
      }

      // 1. Create the branch record
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

      // 2. Fetch all Main entities for this project
      const { data: mainEntities, error: mainError } = await supabase
        .from('knowledge_entities')
        .select('id, canonical_name, entity_type, entity_types, description, attributes')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .eq('layer', 'main')

      if (mainError) {
        console.error('Failed to fetch main entities for branch:', mainError)
        set({ loading: false, error: mainError.message })
        return branch as Branch
      }

      // 3. Copy Main entities into branch
      if (mainEntities && mainEntities.length > 0) {
        const branchEntities = mainEntities.map(entity => ({
          branch_id: branch.id,
          source_entity_id: entity.id,
          project_id: projectId,
          user_id: user.id,
          canonical_name: entity.canonical_name,
          entity_type: entity.entity_type,
          entity_types: entity.entity_types || [],
          description: entity.description || null,
          attributes: entity.attributes || {},
          is_modified: false,
          modified_fields: [],
        }))

        const { error: copyError } = await supabase
          .from('knowledge_branch_entities')
          .insert(branchEntities)

        if (copyError) {
          console.error('Failed to copy entities to branch:', copyError)
          set({ error: `Branch created but failed to copy entities: ${copyError.message}` })
        }
      }

      // 4. Refresh state
      await get().fetchBranches(projectId)
      await get().fetchBranchEntities(branch.id)

      set({ loading: false })
      return branch as Branch
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      set({ loading: false, error: msg })
      return null
    }
  },

  // ==============================
  // Fetch branch entities
  // ==============================
  fetchBranchEntities: async (branchId: string) => {
    try {
      const { data, error } = await supabase
        .from('knowledge_branch_entities')
        .select('*')
        .eq('branch_id', branchId)
        .order('canonical_name')

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
  // Update a branch entity (edit in branch)
  // ==============================
  updateBranchEntity: async (branchEntityId: string, updates) => {
    try {
      // Get current branch entity to determine which fields changed
      const current = get().branchEntities.find(e => e.id === branchEntityId)
      if (!current) return

      // Get the corresponding main entity to compare
      const mainEntity = get().mainEntities.find(e => e.id === current.source_entity_id)

      // Determine modified fields
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
        const mainEntity = mainEntities.find(m => m.id === branchEntity.source_entity_id)
        if (!mainEntity) continue

        const diffs: FieldDiff[] = []

        // Compare canonical_name
        diffs.push({
          field: 'canonical_name',
          mainValue: mainEntity.canonical_name,
          branchValue: branchEntity.canonical_name,
          changed: mainEntity.canonical_name !== branchEntity.canonical_name,
        })

        // Compare description
        diffs.push({
          field: 'description',
          mainValue: mainEntity.description,
          branchValue: branchEntity.description,
          changed: (mainEntity.description || '') !== (branchEntity.description || ''),
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
          entityName: branchEntity.canonical_name,
          entityType: branchEntity.entity_type,
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
