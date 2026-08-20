import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Save, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import {
  type EntityType,
  getFieldGroupsForType,
  getFieldsForType,
  createEmptyFields,
  TEXTAREA_FIELDS,
  ENTITY_TYPE_META,
} from '@/lib/entityTypes'
import { useEntityStore, type Entity } from '@/stores/entityStore'
import { useBranchStore } from '@/stores/branchStore'
import { supabase } from '@/lib/supabase'

interface EntityModalProps {
  isOpen: boolean
  onClose: () => void
  entityType: EntityType
  projectId: string
  /** If provided, modal is in edit mode. Otherwise, create mode. */
  entity?: Entity | null
  /** Version context for determining edit target (Main or Branch). Defaults to 'main'. */
  selectedVersion?: 'main' | 'branch'
  onSaved?: () => void
}

export default function EntityModal({
  isOpen,
  onClose,
  entityType,
  projectId,
  entity,
  selectedVersion = 'main',
  onSaved,
}: EntityModalProps) {
  const { t } = useTranslation()
  const { createEntity, updateEntity, deleteEntity } = useEntityStore()
  const { currentBranch } = useBranchStore()

  const isEditMode = !!entity

  // Memoize field lists so they only change when entityType changes,
  // not on every render. This prevents form reinitialization while user is typing.
  const fieldGroups = useMemo(
    () => getFieldGroupsForType(entityType),
    [entityType]
  )
  const allFields = useMemo(
    () => getFieldsForType(entityType),
    [entityType]
  )

  // Form state: all fields as string | null
  const [formData, setFormData] = useState<Record<string, string | null>>({})
  const [aliasesText, setAliasesText] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Initialize form data
  // Depends only on isOpen and entity (the inputs), not on allFields.
  // This ensures form is reinitialized only when modal is opened/closed or entity changes,
  // not when user types (which would trigger render but not change entity).
  useEffect(() => {
    if (!isOpen) return

    if (entity && entity.structured_fields && Object.keys(entity.structured_fields).length > 0) {
      // Edit mode: load from structured_fields
      const data: Record<string, string | null> = {}
      for (const field of allFields) {
        const value = (entity.structured_fields as Record<string, unknown>)[field]
        data[field] = value != null ? String(value) : null
      }
      setFormData(data)
    } else if (entity) {
      // Edit mode but no structured_fields yet — populate from name/description + attributes
      const data = createEmptyFields(entityType) as Record<string, string | null>
      data.name = entity.name || null
      if ('description' in data) {
        data.description = entity.description || null
      }
      // Try to populate from attributes (AI-extracted data)
      if (entity.attributes && Object.keys(entity.attributes).length > 0) {
        for (const field of allFields) {
          if (data[field] != null) continue // already set from name/description
          const attrValue = (entity.attributes as Record<string, unknown>)[field]
          if (attrValue != null) {
            data[field] = Array.isArray(attrValue) ? attrValue.join(', ') : String(attrValue)
          }
        }
      }
      setFormData(data)
    } else {
      // Create mode: all fields null
      setFormData(createEmptyFields(entityType) as Record<string, string | null>)
    }

    // Expand all groups by default
    setExpandedGroups(new Set(fieldGroups.map(g => g.key)))
    setShowDeleteConfirm(false)
    // Initialize aliases
    setAliasesText(entity?.aliases?.join(', ') || '')
  }, [isOpen, entity, entityType])

  const handleFieldChange = useCallback((field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value || null,
    }))
  }, [])

  const toggleGroup = useCallback((groupKey: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupKey)) {
        next.delete(groupKey)
      } else {
        next.add(groupKey)
      }
      return next
    })
  }, [])

  const syncAliases = async (entityId: string, branchId?: string) => {
    const newAliases = aliasesText
      .split(',')
      .map(a => a.trim())
      .filter(a => a.length > 0)

    // Delete existing aliases and re-insert (simpler than diffing)
    // Scope delete by (entity_id, branch_id) to isolate Main vs Branch aliases
    let deleteQuery = supabase
      .from('knowledge_entity_aliases')
      .delete()
      .eq('entity_id', entityId)
    
    if (branchId) {
      deleteQuery = deleteQuery.eq('branch_id', branchId)
    }
    
    await deleteQuery

    if (newAliases.length > 0) {
      const aliasRecords = newAliases.map(alias => ({ 
        entity_id: entityId, 
        alias,
        ...(branchId && { branch_id: branchId })
      }))
      await supabase
        .from('knowledge_entity_aliases')
        .insert(aliasRecords)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Build structured_fields — keep null for empty fields
      const structuredFields: Record<string, unknown> = {}
      for (const field of allFields) {
        const value = formData[field]
        structuredFields[field] = value && value.trim() ? value.trim() : null
      }

      if (isEditMode && entity) {
        // Update existing entity
        const name = (structuredFields.name as string) || entity.name
        // Route based on selectedVersion, not currentBranch existence
        const branchContext = selectedVersion === 'branch' && currentBranch
          ? { branchId: currentBranch.id, sourceEntityId: entity.id }
          : undefined
        
        await updateEntity(entity.id, {
          canonical_name: name,
          description: (structuredFields.description as string) || null,
          structured_fields: structuredFields,
        }, branchContext)
        // Sync aliases with branch scope
        const branchId = selectedVersion === 'branch' && currentBranch ? currentBranch.id : undefined
        await syncAliases(entity.id, branchId)
      } else {
        // Create new entity
        const name = (structuredFields.name as string) || 'ישות חדשה'
        structuredFields.name = name
        // Route based on selectedVersion, not currentBranch existence
        const branchContext = selectedVersion === 'branch' && currentBranch
          ? { branchId: currentBranch.id, layer: 'branch' as const }
          : undefined
        
        const created = await createEntity(projectId, entityType, structuredFields, branchContext)
        // Sync aliases for new entity with branch scope
        if (created) {
          const branchId = selectedVersion === 'branch' && currentBranch ? currentBranch.id : undefined
          await syncAliases(created.id, branchId)
        }
      }

      onSaved?.()
      onClose()
    } catch (error) {
      console.error('Failed to save entity:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!entity) return
    setSaving(true)
    try {
      await deleteEntity(entity.id)
      onSaved?.()
      onClose()
    } catch (error) {
      console.error('Failed to delete entity:', error)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const meta = ENTITY_TYPE_META[entityType]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="entity-modal-title">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-card border rounded-xl shadow-xl flex flex-col mx-4 overflow-hidden z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/30 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{meta.icon}</span>
            <h2 id="entity-modal-title" className="text-lg font-semibold">
              {isEditMode
                ? t('entityModal.editTitle', { type: t(meta.labelKey) })
                : t('entityModal.createTitle', { type: t(meta.labelKey) })
              }
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            aria-label={t('common.cancel')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Aliases */}
          <div className="border rounded-lg p-4">
            <label htmlFor="aliases-input" className="block text-sm font-medium text-muted-foreground mb-1">
              {t('entityFields.aliases')}
            </label>
            <input
              id="aliases-input"
              type="text"
              value={aliasesText}
              onChange={e => setAliasesText(e.target.value)}
              placeholder={t('entityFields.aliasesPlaceholder')}
              className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">{t('entityFields.aliasesHint')}</p>
          </div>

          {fieldGroups.map(group => (
            <div key={group.key} className="border rounded-lg overflow-hidden">
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group.key)}
                className="w-full flex items-center gap-2 px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-start"
                aria-expanded={expandedGroups.has(group.key)}
              >
                {expandedGroups.has(group.key) ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 rtl:rotate-180" />
                )}
                <span className="font-medium text-sm">{t(group.labelKey)}</span>
                <span className="text-xs text-muted-foreground ms-auto">
                  {group.fields.filter(f => formData[f] != null && formData[f] !== '').length}/{group.fields.length}
                </span>
              </button>

              {/* Group fields */}
              {expandedGroups.has(group.key) && (
                <div className="p-4 space-y-3">
                  {group.fields.map(field => (
                    <FieldInput
                      key={field}
                      field={field}
                      value={formData[field] ?? ''}
                      onChange={handleFieldChange}
                      isTextarea={TEXTAREA_FIELDS.has(field)}
                      t={t}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/30 shrink-0">
          <div>
            {isEditMode && (
              showDeleteConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-600">{t('entityModal.confirmDelete')}</span>
                  <button
                    onClick={handleDelete}
                    disabled={saving}
                    className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50"
                  >
                    {t('common.delete')}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-3 py-1.5 text-sm bg-muted rounded-md hover:bg-muted/80"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  {t('common.delete')}
                </button>
              )
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm bg-muted rounded-md hover:bg-muted/80 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Save className="h-4 w-4" />
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================
// Individual field input component
// ============================================

interface FieldInputProps {
  field: string
  value: string
  onChange: (field: string, value: string) => void
  isTextarea: boolean
  t: (key: string, opts?: Record<string, unknown>) => string
}

function FieldInput({ field, value, onChange, isTextarea, t }: FieldInputProps) {
  const label = t(`entityFields.${field}`)
  const placeholder = t('entityModal.unknownPlaceholder')

  return (
    <div>
      <label htmlFor={`field-${field}`} className="block text-sm font-medium text-muted-foreground mb-1">
        {label}
      </label>
      {isTextarea ? (
        <textarea
          id={`field-${field}`}
          value={value}
          onChange={e => onChange(field, e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full px-3 py-2 border rounded-md text-sm bg-background resize-y min-h-[60px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      ) : (
        <input
          id={`field-${field}`}
          type="text"
          value={value}
          onChange={e => onChange(field, e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      )}
    </div>
  )
}
