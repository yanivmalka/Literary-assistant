import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Save, ChevronDown, ChevronRight } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useEntityStore } from '@/stores/entityStore'
import { useBranchStore } from '@/stores/branchStore'
import { getFieldGroupsForType, getFieldsForType, TEXTAREA_FIELDS } from '@/lib/entityTypes'
import type { Entity } from '@/stores/entityStore'

interface CharacterEditModalProps {
  isOpen: boolean
  character: Entity
  projectId: string
  onClose: () => void
  onCharacterUpdated?: () => void
}

interface FormData {
  [key: string]: string | null
}

export default function CharacterEditModal({
  isOpen,
  character,
  projectId,
  onClose,
  onCharacterUpdated,
}: CharacterEditModalProps) {
  const { t } = useTranslation()
  const { updateEntity, fetchEntities } = useEntityStore()
  const { currentBranch, fetchCurrentBranch } = useBranchStore()

  const [mountNode, setMountNode] = useState<HTMLElement | null>(null)
  const [formData, setFormData] = useState<FormData>({})
  const [originalFormData, setOriginalFormData] = useState<FormData>({})
  const [saving, setSaving] = useState(false)
  const [isBranch, setIsBranch] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const entityType = character.entity_type as any
  const fieldGroups = useMemo(
    () => getFieldGroupsForType(entityType),
    [entityType]
  )
  const allFields = useMemo(
    () => getFieldsForType(entityType),
    [entityType]
  )

  useEffect(() => {
    setMountNode(document.body)
  }, [])

  useEffect(() => {
    if (projectId) {
      fetchCurrentBranch(projectId).then(branch => {
        setIsBranch(!!branch)
      })
    }
  }, [projectId, fetchCurrentBranch])

  // Initialize form data
  useEffect(() => {
    if (!character) return

    const data: FormData = {}
    for (const field of allFields) {
      const value = (character.structured_fields as Record<string, unknown>)?.[field]
      data[field] = value != null ? String(value) : null
    }
    setFormData(data)
    setOriginalFormData(data)

    // Expand all groups by default
    const groups = new Set<string>()
    fieldGroups.forEach(group => groups.add(group.key))
    setExpandedGroups(groups)
  }, [character, allFields, fieldGroups])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  if (!isOpen || !mountNode) return null

  const handleFieldChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value || null,
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const structuredFields: Record<string, unknown> = {}
      for (const field of allFields) {
        const value = formData[field]
        structuredFields[field] = value && value.trim() ? value.trim() : null
      }

      const updates = {
        canonical_name: structuredFields.name as string || character.name,
        description: (structuredFields.description as string) || null,
        structured_fields: structuredFields,
      }

      const branchContext = isBranch && currentBranch
        ? { branchId: currentBranch.id, sourceEntityId: character.id }
        : undefined

      const success = await updateEntity(character.id, updates, branchContext)

      if (success) {
        setOriginalFormData(formData)
        await fetchEntities(projectId)
        onCharacterUpdated?.()
        onClose()
      }
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setFormData(originalFormData)
    onClose()
  }

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupKey)) {
        next.delete(groupKey)
      } else {
        next.add(groupKey)
      }
      return next
    })
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleCancel()
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-background rounded-lg shadow-lg max-w-3xl w-full max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="sticky top-0 bg-background border-b p-6 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold">{t('common.edit')}</h2>
            <p className="text-sm text-muted-foreground mt-1">{character.name}</p>
          </div>
          <button
            onClick={handleCancel}
            className="p-1 rounded-md hover:bg-muted transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Form Content */}
        <div className="p-6 space-y-6 max-h-[calc(90vh-200px)] overflow-y-auto">
          {fieldGroups.map(group => (
            <div key={group.key} className="border rounded-lg">
              {/* Group Header */}
              <button
                onClick={() => toggleGroup(group.key)}
                className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
              >
                <h3 className="font-semibold text-muted-foreground">
                  {t(group.labelKey)}
                </h3>
                {expandedGroups.has(group.key) ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>

              {/* Group Fields */}
              {expandedGroups.has(group.key) && (
                <div className="border-t p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                  {group.fields.map(field => {
                    const value = formData[field as string] ?? ''
                    const isTextarea = TEXTAREA_FIELDS.has(field as string)
                    const fieldLabel = t(`entityFields.${field}`, { defaultValue: field })

                    return (
                      <div key={field}>
                        <label className="text-sm font-medium" htmlFor={field}>
                          {fieldLabel}
                        </label>
                        {isTextarea ? (
                          <textarea
                            id={field}
                            value={value}
                            onChange={e => handleFieldChange(field as string, e.target.value)}
                            className="mt-1 w-full px-3 py-2 border rounded-md bg-background text-foreground placeholder-muted-foreground resize-none"
                            rows={4}
                          />
                        ) : (
                          <input
                            id={field}
                            type="text"
                            value={value}
                            onChange={e => handleFieldChange(field as string, e.target.value)}
                            className="mt-1 w-full px-3 py-2 border rounded-md bg-background text-foreground placeholder-muted-foreground"
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer - Action Buttons */}
        <div className="sticky bottom-0 bg-background border-t p-6 flex justify-end gap-3">
          <button
            onClick={handleCancel}
            className="px-4 py-2 rounded-md border hover:bg-muted transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Save className="h-4 w-4" />
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>,
    mountNode
  )
}
