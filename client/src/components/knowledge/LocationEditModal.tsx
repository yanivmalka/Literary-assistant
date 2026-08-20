import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Save, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useEntityStore } from '@/stores/entityStore'
import { useBranchStore } from '@/stores/branchStore'
import { getFieldGroupsForType, getFieldsForType, TEXTAREA_FIELDS } from '@/lib/entityTypes'
import type { Entity } from '@/stores/entityStore'

interface LocationEditModalProps {
  isOpen: boolean
  location: Entity | null
  projectId: string
  selectedVersion: 'main' | 'branch'
  onClose: () => void
  onLocationUpdated?: () => void
}

interface FormData {
  [key: string]: string | null
}

export default function LocationEditModal({
  isOpen,
  location,
  projectId,
  selectedVersion,
  onClose,
  onLocationUpdated,
}: LocationEditModalProps) {
  const { t } = useTranslation()
  const { createEntity, updateEntity, deleteEntity, fetchEntities } = useEntityStore()
  const { currentBranch } = useBranchStore()

  const [mountNode, setMountNode] = useState<HTMLElement | null>(null)
  const [formData, setFormData] = useState<FormData>({})
  const [originalFormData, setOriginalFormData] = useState<FormData>({})
  const [saving, setSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const isNewLocation = location === null
  const entityType = (location?.entity_type || 'location') as any
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

  // Initialize form data
  useEffect(() => {
    const data: FormData = {}
    
    if (location) {
      // Editing existing location
      for (const field of allFields) {
        const value = (location.structured_fields as Record<string, unknown>)?.[field]
        data[field] = value != null ? String(value) : null
      }
    } else {
      // Creating new location - initialize with empty values
      for (const field of allFields) {
        data[field] = null
      }
    }
    
    setFormData(data)
    setOriginalFormData(data)

    // Expand all groups by default
    const groups = new Set<string>()
    fieldGroups.forEach(group => groups.add(group.key))
    setExpandedGroups(groups)
  }, [location, allFields, fieldGroups])

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

      let locationName = (structuredFields.name as string)?.trim() || ''
      
      // Validate that name is not empty
      if (!locationName) {
        alert(t('entityModal.nameRequired') || 'Location name is required')
        setSaving(false)
        return
      }

      structuredFields.name = locationName

      if (isNewLocation) {
        // Create new location
        const branchContext = selectedVersion === 'branch' && currentBranch
          ? { branchId: currentBranch.id, layer: 'branch' as const }
          : undefined

        await createEntity(
          projectId,
          'location',
          structuredFields,
          branchContext
        )
      } else {
        // Update existing location
        const updates = {
          canonical_name: locationName,
          description: (structuredFields.description as string) || null,
          structured_fields: structuredFields,
        }

        const branchContext = selectedVersion === 'branch' && currentBranch
          ? { branchId: currentBranch.id, sourceEntityId: location.id }
          : undefined

        await updateEntity(location.id, updates, branchContext)
      }

      await fetchEntities(projectId)
      onLocationUpdated?.()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setFormData(originalFormData)
    setShowDeleteConfirm(false)
    onClose()
  }

  const handleDelete = async () => {
    if (!location) return
    if (selectedVersion === 'branch' && !currentBranch) return

    setSaving(true)
    try {
      const branchContext = selectedVersion === 'branch' && currentBranch
        ? { branchId: currentBranch.id, layer: 'branch' as const }
        : { layer: 'main' as const }
      
      await deleteEntity(location.id, branchContext)
      await fetchEntities(projectId)
      onLocationUpdated?.()
      onClose()
    } finally {
      setSaving(false)
      setShowDeleteConfirm(false)
    }
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

  const title = isNewLocation
    ? t('entities.newLocation')
    : location?.name || t('entities.types.location')

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-background rounded-lg shadow-lg max-w-3xl w-full max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="sticky top-0 bg-background border-b p-6 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold">
              {isNewLocation ? t('common.new') : t('common.edit')}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">{title}</p>
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
                    const isNameField = field === 'name'
                    const placeholder = isNameField ? t('entities.types.location') : ''

                    return (
                      <div key={field}>
                        <label className="text-sm font-medium" htmlFor={field}>
                          {fieldLabel} {isNameField && <span className="text-red-600">*</span>}
                        </label>
                        {isTextarea ? (
                          <textarea
                            id={field}
                            value={value}
                            onChange={e => handleFieldChange(field as string, e.target.value)}
                            className="mt-1 w-full px-3 py-2 border rounded-md bg-background text-foreground placeholder-muted-foreground resize-none"
                            rows={4}
                            placeholder={placeholder}
                          />
                        ) : (
                          <input
                            id={field}
                            type="text"
                            value={value}
                            onChange={e => handleFieldChange(field as string, e.target.value)}
                            className="mt-1 w-full px-3 py-2 border rounded-md bg-background text-foreground placeholder-muted-foreground"
                            placeholder={placeholder}
                            required={isNameField}
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
        <div className="sticky bottom-0 bg-background border-t p-6 flex items-center justify-between gap-3">
          <div>
            {!isNewLocation && (
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
                    disabled={saving}
                    className="px-3 py-1.5 text-sm bg-muted rounded-md hover:bg-muted/80 disabled:opacity-50"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  {t('common.delete')}
                </button>
              )
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCancel}
              disabled={saving}
              className="px-4 py-2 rounded-md border hover:bg-muted transition-colors disabled:opacity-50"
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
      </div>
    </div>,
    mountNode
  )
}
