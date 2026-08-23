import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Save, Trash2, ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useEntityStore } from '@/stores/entityStore'
import { useBranchStore } from '@/stores/branchStore'
import { getFieldGroupsForType, getFieldsForType, TEXTAREA_FIELDS } from '@/lib/entityTypes'
import type { ExtractionModelProfile } from '@/lib/extractionModels'
import {
  CHARACTER_FIELD_CATALOG,
  DYNAMIC_CHARACTER_PROFILE,
  createCustomCharacterField,
  enableCharacterField,
  getCatalogCharacterField,
  isDynamicCharacterProfile,
  isPopulatedCharacterField,
  loadCharacterFieldSchema,
  type CharacterFieldDefinition,
} from '@/lib/characterSchema'
import type { Entity } from '@/stores/entityStore'

interface CharacterEditModalProps {
  isOpen: boolean
  character: Entity
  projectId: string
  selectedVersion: 'main' | 'branch'
  modelProfile: ExtractionModelProfile
  onClose: () => void
  onCharacterUpdated?: () => void
}

interface FormData {
  [key: string]: string | null
}

function parseMultiValue(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.map(item => String(item).trim()).filter(Boolean)
  } catch {
    // Fall through to comma-separated compatibility values.
  }
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

const DYNAMIC_GROUP_TRANSLATION_KEYS: Record<string, string> = {
  'זהות': 'entityFields.dynamic.groups.identityShort',
  'זהות ופרטים אישיים': 'entityFields.dynamic.groups.identity',
  'תכונות': 'entityFields.dynamic.groups.traits',
  'מראה חיצוני': 'entityFields.dynamic.groups.appearance',
  'עולם הדמות': 'entityFields.dynamic.groups.world',
  'ניתוח ותיאור': 'entityFields.dynamic.groups.analysis',
  'שדות מותאמים אישית': 'entityFields.dynamic.groups.custom',
}

function dynamicGroupLabel(groupKey: string, translate: (key: string, options?: { defaultValue?: string }) => string) {
  return translate(DYNAMIC_GROUP_TRANSLATION_KEYS[groupKey] || groupKey, { defaultValue: groupKey })
}

export default function CharacterEditModal({
  isOpen,
  character,
  projectId,
  selectedVersion,
  modelProfile,
  onClose,
  onCharacterUpdated,
}: CharacterEditModalProps) {
  const { t } = useTranslation()
  const { updateEntity, deleteEntity, fetchEntities } = useEntityStore()
  const { currentBranch } = useBranchStore()

  const [mountNode, setMountNode] = useState<HTMLElement | null>(null)
  const [formData, setFormData] = useState<FormData>({})
  const [originalFormData, setOriginalFormData] = useState<FormData>({})
  const [saving, setSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [dynamicFields, setDynamicFields] = useState<CharacterFieldDefinition[]>([])
  const [dynamicSchemaLoading, setDynamicSchemaLoading] = useState(false)
  const [fieldToAdd, setFieldToAdd] = useState('')
  const [newFieldLabel, setNewFieldLabel] = useState('')
  const [newFieldType, setNewFieldType] = useState<'text' | 'long_text'>('text')

  const isDynamicProfile = isDynamicCharacterProfile(modelProfile)
  const structuredValues = useMemo(
    () => (character.structured_fields || {}) as Record<string, unknown>,
    [character.structured_fields],
  )

  const entityType = character.entity_type as any
  const staticFieldGroups = useMemo(
    () => getFieldGroupsForType(entityType),
    [entityType]
  )
  const staticFields = useMemo(
    () => getFieldsForType(entityType),
    [entityType]
  )
  const populatedDynamicKeys = useMemo(
    () => Object.entries(structuredValues)
      .filter(([key, value]) => key !== 'name' && isPopulatedCharacterField(value))
      .map(([key]) => key),
    [structuredValues]
  )
  const visibleDynamicFields = useMemo(() => {
    if (!isDynamicProfile) return []
    const selectedFields = new Map(dynamicFields.map(field => [field.field_key, field]))
    for (const field of CHARACTER_FIELD_CATALOG) {
      if (populatedDynamicKeys.includes(field.field_key)) selectedFields.set(field.field_key, field)
    }
    return [...selectedFields.values()].sort((a, b) => a.sort_order - b.sort_order)
  }, [dynamicFields, isDynamicProfile, populatedDynamicKeys])
  const dynamicGroups = useMemo(() => {
    const groups = new Map<string, CharacterFieldDefinition[]>()
    groups.set('זהות', [
      {
        model_profile: DYNAMIC_CHARACTER_PROFILE,
        field_key: 'name',
        label: t('entityFields.name'),
        field_type: 'text',
        group_key: 'זהות',
        options: [],
        is_active: true,
        sort_order: 0,
      },
      {
        ...(getCatalogCharacterField('first_name') as CharacterFieldDefinition),
        field_key: 'first_name',
        label: getCatalogCharacterField('first_name')?.label || 'שם פרטי',
        group_key: 'זהות',
        sort_order: 1,
      },
    ])
    for (const field of visibleDynamicFields) {
      // first_name is already rendered in the explicit identity group above.
      if (field.field_key === 'first_name') continue
      const group = groups.get(field.group_key) || []
      group.push(field)
      groups.set(field.group_key, group)
    }
    return [...groups.entries()]
  }, [visibleDynamicFields])
  const fieldGroups = useMemo(
    () => isDynamicProfile
      ? dynamicGroups.map(([key, fields]) => ({ key, labelKey: '', label: key, fields }))
      : staticFieldGroups,
    [dynamicGroups, isDynamicProfile, staticFieldGroups],
  )
  const allFields = useMemo(
    () => isDynamicProfile
      ? ['name', 'first_name', ...visibleDynamicFields.filter(field => field.field_key !== 'first_name').map(field => field.field_key)]
      : staticFields,
    [isDynamicProfile, staticFields, visibleDynamicFields],
  )
  const availableDynamicFields = CHARACTER_FIELD_CATALOG.filter(
    field => !visibleDynamicFields.some(selected => selected.field_key === field.field_key),
  )

  useEffect(() => {
    setMountNode(document.body)
  }, [])

  useEffect(() => {
    if (!isOpen || !isDynamicProfile) {
      setDynamicFields([])
      setFieldToAdd('')
      return
    }
    setDynamicSchemaLoading(true)
    loadCharacterFieldSchema(projectId, modelProfile)
      .then(setDynamicFields)
      .catch(error => console.error('Failed to load character field schema:', error))
      .finally(() => setDynamicSchemaLoading(false))
  }, [isOpen, isDynamicProfile, modelProfile, projectId])

  // Initialize form data
  useEffect(() => {
    if (!character) return

    const data: FormData = {}
    const attributes = (character.attributes || {}) as Record<string, unknown>
    const structured = (character.structured_fields || {}) as Record<string, unknown>
    for (const field of allFields) {
      const definition = typeof field === 'string' ? getCatalogCharacterField(field) : field
      const rawValue = structured[field] ?? attributes[field] ?? (field === 'name' ? character.name : field === 'aliases' ? character.aliases : null)
      data[field] = rawValue == null
        ? null
        : definition?.field_type === 'multi_select' && Array.isArray(rawValue)
          ? JSON.stringify(rawValue)
          : String(rawValue)
    }
    setFormData(data)
    setOriginalFormData(data)

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
      const structuredFields: Record<string, unknown> = {
        ...((character.structured_fields || {}) as Record<string, unknown>),
      }
      for (const field of allFields) {
        const value = formData[field]
        const definition = dynamicFields.find(item => item.field_key === field) || getCatalogCharacterField(field)
        if (definition?.field_type === 'multi_select') {
          structuredFields[field] = parseMultiValue(value)
        } else {
          structuredFields[field] = value && value.trim() ? value.trim() : null
        }
      }

      const firstName = String(structuredFields.first_name || '').trim()
      const lastName = String(structuredFields.last_name || '').trim()
      const canonicalName = String(structuredFields.name || '').trim() || [firstName, lastName].filter(Boolean).join(' ')
      if (!canonicalName) {
        alert(t('entityModal.nameRequired'))
        return
      }
      structuredFields.name = canonicalName
      const aliases = parseMultiValue(formData.aliases)

      const updates = {
        canonical_name: canonicalName,
        description: (structuredFields.description as string) || null,
        structured_fields: structuredFields,
        aliases,
      }

      // Route based on selectedVersion, not currentBranch existence
      const branchContext = selectedVersion === 'branch' && currentBranch
        ? { branchId: currentBranch.id, sourceEntityId: character.id }
        : undefined

      const success = await updateEntity(character.id, updates, branchContext)

      if (success) {
        setOriginalFormData(formData)
        await fetchEntities(projectId, undefined, modelProfile)
        onCharacterUpdated?.()
        onClose()
      }
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setFormData(originalFormData)
    setShowDeleteConfirm(false)
    onClose()
  }

  const handleAddField = async () => {
    if (!isDynamicProfile || !fieldToAdd) return
    const field = getCatalogCharacterField(fieldToAdd)
    if (!field) return
    try {
      const enabled = await enableCharacterField(projectId, {
        ...field,
        model_profile: modelProfile as 'sub-base-c-characters' | 'sub-base-locations',
      })
      setDynamicFields(current => [
        ...current.filter(item => item.field_key !== enabled.field_key),
        enabled,
      ].sort((a, b) => a.sort_order - b.sort_order))
      setFormData(current => ({ ...current, [enabled.field_key]: null }))
      setFieldToAdd('')
      setExpandedGroups(current => new Set([...current, enabled.group_key]))
    } catch (error) {
      console.error('Failed to enable character field:', error)
    }
  }

  const handleAddCustomField = async () => {
    if (!isDynamicProfile || !newFieldLabel.trim()) return
    try {
      const created = await createCustomCharacterField({
        projectId,
        label: newFieldLabel,
        fieldType: newFieldType,
        modelProfile: modelProfile as 'sub-base-c-characters' | 'sub-base-locations',
      })
      setDynamicFields(current => [
        ...current.filter(item => item.field_key !== created.field_key),
        created,
      ].sort((a, b) => a.sort_order - b.sort_order))
      setFormData(current => ({ ...current, [created.field_key]: null }))
      setNewFieldLabel('')
      setExpandedGroups(current => new Set([...current, created.group_key]))
    } catch (error) {
      console.error('Failed to create custom character field:', error)
    }
  }

  const handleDelete = async () => {
    if (selectedVersion === 'branch' && !currentBranch) return

    setSaving(true)
    try {
      const branchContext = selectedVersion === 'branch' && currentBranch
        ? { branchId: currentBranch.id, layer: 'branch' as const }
        : { layer: 'main' as const }
      const success = await deleteEntity(character.id, branchContext)

      if (success) {
        await fetchEntities(projectId, undefined, modelProfile)
        onCharacterUpdated?.()
        onClose()
      }
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
              <button
                onClick={() => toggleGroup(group.key)}
                className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
              >
                <h3 className="font-semibold text-muted-foreground">
                  {isDynamicProfile ? dynamicGroupLabel(group.key, t) : t(group.labelKey)}
                </h3>
                {expandedGroups.has(group.key) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              {expandedGroups.has(group.key) && (
                <div className="border-t p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                  {group.fields.map(field => {
                    const fieldKey = typeof field === 'string' ? field : field.field_key
                    const fieldDefinition = typeof field === 'string'
                      ? dynamicFields.find(item => item.field_key === field) || getCatalogCharacterField(field)
                      : field
                    const value = formData[fieldKey] ?? ''
                    const isTextarea = fieldDefinition?.field_type === 'long_text' || TEXTAREA_FIELDS.has(fieldKey)
                    const fieldLabel = isDynamicProfile && fieldDefinition
                      ? t(`entityFields.dynamic.${fieldKey}`, { defaultValue: fieldDefinition?.label || fieldKey })
                      : t(`entityFields.${fieldKey}`, { defaultValue: fieldKey })
                    return (
                      <div key={fieldKey}>
                        <label className="text-sm font-medium" htmlFor={fieldKey}>{fieldLabel}</label>
                        {isTextarea ? (
                          <textarea
                            id={fieldKey}
                            name={fieldKey}
                            autoComplete="off"
                            value={value}
                            onChange={e => handleFieldChange(fieldKey, e.target.value)}
                            className="mt-1 w-full px-3 py-2 border rounded-md bg-background text-foreground placeholder-muted-foreground resize-none"
                            rows={4}
                          />
                        ) : (
                          <input
                            id={fieldKey}
                            name={fieldKey}
                            type="text"
                            autoComplete="off"
                            value={value}
                            onChange={e => handleFieldChange(fieldKey, e.target.value)}
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

          {isDynamicProfile && (
            <>
              <section className="border border-dashed rounded-lg p-4 space-y-3">
                <div>
                  <h3 className="font-semibold">{t('ui.character.addFieldTitle')}</h3>
                  <p className="text-xs text-muted-foreground">{t('ui.character.addFieldHint')}</p>
                </div>
                <div className="flex gap-2">
                  <label htmlFor="character-field-to-add" className="sr-only">{t('ui.character.selectField')}</label>
                  <select
                    id="character-field-to-add"
                    name="character-field-to-add"
                    autoComplete="off"
                    value={fieldToAdd}
                    onChange={event => setFieldToAdd(event.target.value)}
                    disabled={dynamicSchemaLoading || availableDynamicFields.length === 0}
                    className="flex-1 px-3 py-2 border rounded-md bg-background"
                  >
                    <option value="">{t('ui.character.selectField')}</option>
                    {availableDynamicFields.map(field => <option key={field.field_key} value={field.field_key}>{field.label}</option>)}
                  </select>
                  <button onClick={handleAddField} disabled={!fieldToAdd || dynamicSchemaLoading} className="px-3 py-2 border rounded-md disabled:opacity-50">
                    {t('ui.character.addField')}
                  </button>
                </div>
                {availableDynamicFields.length === 0 && <p className="text-xs text-muted-foreground">{t('ui.character.allFieldsSelected')}</p>}
              </section>
              <section className="border border-dashed rounded-lg p-4 space-y-3">
                <div>
                  <h3 className="font-semibold">{t('ui.character.addCustomFieldTitle')}</h3>
                  <p className="text-xs text-muted-foreground">{t('ui.character.addCustomFieldHint')}</p>
                </div>
                <div className="flex gap-2">
                  <input
                    id="character-custom-field-label"
                    name="character-custom-field-label"
                    autoComplete="off"
                    value={newFieldLabel}
                    onChange={event => setNewFieldLabel(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void handleAddCustomField() } }}
                    placeholder={t('ui.character.customFieldPlaceholder')}
                    className="flex-1 px-3 py-2 border rounded-md bg-background"
                  />
                  <select value={newFieldType} onChange={event => setNewFieldType(event.target.value as 'text' | 'long_text')} className="px-3 py-2 border rounded-md bg-background">
                    <option value="text">{t('ui.character.textField')}</option>
                    <option value="long_text">{t('ui.character.longTextField')}</option>
                  </select>
                  <button onClick={() => void handleAddCustomField()} disabled={!newFieldLabel.trim()} className="flex items-center gap-1 px-3 py-2 border rounded-md disabled:opacity-50">
                    <Plus className="h-4 w-4" />{t('ui.character.addField')}
                  </button>
                </div>
              </section>
            </>
          )}
        </div>

        {/* Footer - Action Buttons */}
        <div className="sticky bottom-0 bg-background border-t p-6 flex items-center justify-between gap-3">
          <div>
            {showDeleteConfirm ? (
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
