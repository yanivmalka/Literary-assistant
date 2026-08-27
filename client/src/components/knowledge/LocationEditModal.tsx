import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Save, Trash2, ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useEntityStore } from '@/stores/entityStore'
import { useBranchStore } from '@/stores/branchStore'
import {
  createCustomPlaceField,
  createCustomPlaceType,
  getPlaceFields,
  getPlaceType,
  loadPlaceSchema,
  type PlaceFieldDefinition,
  type PlaceSchema,
} from '@/lib/placeSchema'
import { getContainerOptions, savePlaceContainers } from '@/lib/placeHierarchy'
import type { Entity } from '@/stores/entityStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AlertDialog } from '@/components/ui/AlertDialog'

interface LocationEditModalProps {
  isOpen: boolean
  location: Entity | null
  locations: Entity[]
  parentsByChild: Record<string, string[]>
  projectId: string
  selectedVersion: 'main' | 'branch'
  onClose: () => void
  onLocationUpdated?: () => void
}

type FormData = Record<string, string | null>

const LEGACY_LOCATION_FIELDS = ['continent', 'country', 'region', 'city'] as const

function parseMultiSelectValue(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(item => String(item)) : [value]
  } catch {
    return value.split(',').map(item => item.trim()).filter(Boolean)
  }
}

function formatInitialFieldValue(value: unknown, fieldType: PlaceFieldDefinition['field_type']): string | null {
  if (value == null) return null
  if (fieldType === 'multi_select' && Array.isArray(value)) return JSON.stringify(value)
  return String(value)
}

function placeFieldLabel(field: PlaceFieldDefinition, translate: (key: string, options?: { defaultValue?: string }) => string) {
  return translate(`entityFields.placeFields.${field.field_key}`, { defaultValue: field.label })
}

function placeGroupLabel(groupKey: string, translate: (key: string, options?: { defaultValue?: string }) => string) {
  return translate(`entityFields.placeGroups.${groupKey}`, { defaultValue: groupKey })
}

function placeTypeLabel(typeKey: string, fallback: string, translate: (key: string, options?: { defaultValue?: string }) => string) {
  return translate(`entityFields.placeTypes.${typeKey}`, { defaultValue: fallback })
}

export default function LocationEditModal({
  isOpen,
  location,
  locations,
  parentsByChild,
  projectId,
  selectedVersion,
  onClose,
  onLocationUpdated,
}: LocationEditModalProps) {
  const { t } = useTranslation()
  const { createEntity, updateEntity, deleteEntity, fetchEntities } = useEntityStore()
  const { currentBranch } = useBranchStore()
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null)
  const [schema, setSchema] = useState<PlaceSchema>({ types: [], customFields: [] })
  const [selectedPlaceType, setSelectedPlaceType] = useState('other')
  const [customTypeLabel, setCustomTypeLabel] = useState('')
  const [formData, setFormData] = useState<FormData>({})
  const [originalFormData, setOriginalFormData] = useState<FormData>({})
  const [containerIds, setContainerIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [loadingSchema, setLoadingSchema] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [newFieldLabel, setNewFieldLabel] = useState('')
  const [alertMessage, setAlertMessage] = useState<string | null>(null)

  const isNewLocation = location === null
  const fields = useMemo(() => getPlaceFields(selectedPlaceType, schema), [selectedPlaceType, schema])
  const containerOptions = useMemo(() => getContainerOptions(locations, location?.id), [locations, location?.id])
  const groupedFields = useMemo(() => {
    const groups = new Map<string, PlaceFieldDefinition[]>()
    for (const field of fields) {
      const list = groups.get(field.group_key) || []
      list.push(field)
      groups.set(field.group_key, list)
    }
    return [...groups.entries()]
  }, [fields])

  useEffect(() => setMountNode(document.body), [])

  useEffect(() => {
    if (!isOpen) return
    setLoadingSchema(true)
    loadPlaceSchema(projectId)
      .then(setSchema)
      .finally(() => setLoadingSchema(false))
  }, [isOpen, projectId])

  useEffect(() => {
    if (!isOpen) return
    const structured = (location?.structured_fields || {}) as Record<string, unknown>
    const attributes = (location?.attributes || {}) as Record<string, unknown>
    const placeType = String(structured.place_type || structured.location_type || 'other')
    setSelectedPlaceType(placeType)
    setCustomTypeLabel(placeType === 'other' ? '' : (getPlaceType(schema.types, placeType).label || ''))
    const values: FormData = {}
    for (const field of getPlaceFields(placeType, schema)) {
      values[field.field_key] = formatInitialFieldValue(structured[field.field_key], field.field_type)
    }
    for (const key of LEGACY_LOCATION_FIELDS) {
      if (values[key] == null) {
        values[key] = formatInitialFieldValue(structured[key] ?? attributes[key], 'text')
      }
    }
    values.name = values.name || location?.name || null
    values.description = values.description || location?.description || null
    setFormData(values)
    setOriginalFormData(values)
    setContainerIds(location ? parentsByChild[location.id] || [] : [])
    setExpandedGroups(new Set(getPlaceFields(placeType, schema).map(field => field.group_key)))
  }, [isOpen, location, schema, parentsByChild])

  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen || !mountNode) return null

  const handleSave = async () => {
    setSaving(true)
    try {
      let effectiveType = selectedPlaceType
      let effectiveSchema = schema
      const { data: authData } = await import('@/lib/supabase').then(module => module.supabase.auth.getUser())
      const user = authData.user
      if (!user) throw new Error('Authentication required')

      if (selectedPlaceType === 'other') {
        if (!customTypeLabel.trim()) {
          setAlertMessage(t('ui.location.requiredType'))
          return
        }
        const customType = await createCustomPlaceType(projectId, customTypeLabel, user.id)
        effectiveType = customType.type_key
        effectiveSchema = { ...schema, types: [...schema.types, customType] }
        setSchema(effectiveSchema)
      }

      const existingStructured = (location?.structured_fields || {}) as Record<string, unknown>
      const existingAttributes = (location?.attributes || {}) as Record<string, unknown>
      const structuredFields: Record<string, unknown> = { ...existingStructured }
      for (const key of LEGACY_LOCATION_FIELDS) {
        if (structuredFields[key] == null && existingAttributes[key] != null) structuredFields[key] = existingAttributes[key]
      }
      const requiredMissing: string[] = []
      for (const field of getPlaceFields(effectiveType, effectiveSchema)) {
        const rawValue = formData[field.field_key]
        const isEmpty = !rawValue || (field.field_type === 'multi_select' && parseMultiSelectValue(rawValue).length === 0)
        if (field.is_required && isEmpty) requiredMissing.push(placeFieldLabel(field, t))
        if (field.field_type === 'multi_select') {
          structuredFields[field.field_key] = isEmpty ? null : parseMultiSelectValue(rawValue)
        } else {
          structuredFields[field.field_key] = rawValue && rawValue.trim() ? rawValue.trim() : null
        }
      }
      if (requiredMissing.length > 0) {
        setAlertMessage(t('ui.location.requiredFields', { fields: requiredMissing.join(', ') }))
        return
      }
      const locationName = String(structuredFields.name || '').trim()
      if (!locationName) {
        setAlertMessage(t('entityModal.nameRequired'))
        return
      }
      structuredFields.name = locationName
      structuredFields.place_type = effectiveType
      structuredFields.location_type = effectiveType

      const branchContext = selectedVersion === 'branch' && currentBranch
        ? { branchId: currentBranch.id, layer: 'branch' as const }
        : undefined
      let savedEntity: Entity | null = location
      if (isNewLocation) {
        savedEntity = await createEntity(projectId, 'location', structuredFields, branchContext)
      } else {
        const updates = {
          canonical_name: locationName,
          description: (structuredFields.description as string) || null,
          structured_fields: structuredFields,
        }
        const overlayContext = selectedVersion === 'branch' && currentBranch
          ? { branchId: currentBranch.id, sourceEntityId: location.id }
          : undefined
        const success = await updateEntity(location.id, updates, overlayContext)
        if (!success) throw new Error('Failed to update location')
      }

      if (!savedEntity && isNewLocation) throw new Error('Failed to create location')
      if (savedEntity) {
        await savePlaceContainers({
          projectId,
          locationId: savedEntity.id,
          containerIds,
          branchId: selectedVersion === 'branch' ? currentBranch?.id : null,
        })
      }
      await fetchEntities(projectId)
      onLocationUpdated?.()
      onClose()
    } catch (error) {
      console.error('Failed to save dynamic location:', error)
      setAlertMessage(t('ui.location.deleteFailed'))
    } finally {
      setSaving(false)
    }
  }

  const addCustomField = async () => {
    if (!newFieldLabel.trim()) return
    try {
      const { data: authData } = await import('@/lib/supabase').then(module => module.supabase.auth.getUser())
      if (!authData.user) return
      let placeTypeKey = selectedPlaceType
      if (placeTypeKey === 'other') {
        if (!customTypeLabel.trim()) {
          setAlertMessage(t('ui.location.requiredTypeBeforeField'))
          return
        }
        const customType = await createCustomPlaceType(projectId, customTypeLabel, authData.user.id)
        placeTypeKey = customType.type_key
        setSelectedPlaceType(placeTypeKey)
        setCustomTypeLabel(customType.label)
        setSchema(current => current.types.some(type => type.type_key === placeTypeKey)
          ? current
          : { ...current, types: [...current.types, customType] })
      }
      const created = await createCustomPlaceField({
        projectId,
        userId: authData.user.id,
        placeTypeKey,
        label: newFieldLabel,
      })
      setSchema(current => ({ ...current, customFields: [...current.customFields.filter(field => field.id !== created.id), created] }))
      setFormData(current => ({ ...current, [created.field_key]: null }))
      setNewFieldLabel('')
    } catch (error) {
      console.error('Failed to add custom place field:', error)
    }
  }

  const handleDelete = async () => {
    if (!location) return
    setSaving(true)
    try {
      const context = selectedVersion === 'branch' && currentBranch
        ? { branchId: currentBranch.id, layer: 'branch' as const }
        : { layer: 'main' as const }
      if (await deleteEntity(location.id, context)) {
        await fetchEntities(projectId)
        onLocationUpdated?.()
        onClose()
      }
    } finally {
      setSaving(false)
      setShowDeleteConfirm(false)
    }
  }

  const toggleGroup = (key: string) => setExpandedGroups(current => {
    const next = new Set(current)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  const renderField = (field: PlaceFieldDefinition) => {
    const value = formData[field.field_key] || ''
    const isLong = field.field_type === 'long_text'
    const setValue = (nextValue: string) => setFormData(current => ({ ...current, [field.field_key]: nextValue || null }))
    return (
      <div key={field.field_key}>
        <label className="text-sm font-medium" htmlFor={field.field_key}>
          {placeFieldLabel(field, t)} {field.is_required && <span className="text-destructive">*</span>}
        </label>
        {field.field_type === 'boolean' ? (
          <select id={field.field_key} name={field.field_key} autoComplete="off" value={value} onChange={e => setValue(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring">
            <option value="">{t('ui.location.unknown')}</option><option value="true">{t('ui.location.yes')}</option><option value="false">{t('ui.location.no')}</option>
          </select>
        ) : field.field_type === 'select' ? (
          <select id={field.field_key} name={field.field_key} autoComplete="off" value={value} onChange={e => setValue(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring">
            <option value="">{t('ui.location.select')}</option>{field.options.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        ) : field.field_type === 'multi_select' ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {field.options.map(option => {
              const selected = parseMultiSelectValue(value).includes(option)
              return <label key={option} className="flex items-center gap-2 border border-input rounded px-2 py-1 text-sm"><input id={`location-${field.field_key}-${option}`} name={field.field_key} type="checkbox" checked={selected} onChange={e => {
                const next = new Set(parseMultiSelectValue(value))
                e.target.checked ? next.add(option) : next.delete(option)
                setValue(JSON.stringify([...next]))
              }} />{option}</label>
            })}
          </div>
        ) : isLong ? (
          <textarea id={field.field_key} name={field.field_key} autoComplete="off" value={value} onChange={e => setValue(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring" rows={3} />
        ) : (
          <input id={field.field_key} name={field.field_key} type={field.field_type === 'number' ? 'number' : 'text'} autoComplete="off" value={value} onChange={e => setValue(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring" />
        )}
      </div>
    )
  }

  return createPortal(
    <>
    <AlertDialog
      open={alertMessage !== null}
      title={t('common.notice')}
      description={alertMessage ?? ''}
      confirmLabel={t('common.ok')}
      onConfirm={() => setAlertMessage(null)}
      variant="default"
    />
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-stretch sm:items-center justify-center z-50 p-0 sm:p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-card border border-border rounded-none sm:rounded-lg shadow-lg sm:max-w-4xl w-full h-full sm:h-auto max-h-full sm:max-h-[92vh] overflow-auto flex flex-col">
        <div className="sticky top-0 bg-card border-b border-border p-4 sm:p-6 flex items-start justify-between gap-3 z-10">
          <div className="min-w-0"><h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">{isNewLocation ? t('ui.location.newTitle') : t('ui.location.editTitle')}</h2><p className="text-sm text-muted-foreground mt-1 break-words">{location?.name || t('ui.location.place')}</p></div>
          <button onClick={onClose} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-accent transition-colors"><X className="h-6 w-6" /></button>
        </div>

        <div className="flex-1 p-4 sm:p-6 space-y-6">
          {loadingSchema ? <p className="text-sm text-muted-foreground">{t('ui.location.loadingSchema')}</p> : null}
          <section className="rounded-lg border border-border bg-card p-4 space-y-4">
            <h3 className="font-display font-semibold">{t('ui.location.identity')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label htmlFor="location-name" className="text-sm font-medium">{t('ui.location.name')} *</label><input id="location-name" name="location-name" autoComplete="off" value={formData.name || ''} onChange={e => setFormData(current => ({ ...current, name: e.target.value || null }))} className="mt-1 w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring" /></div>
              <div><label htmlFor="location-place-type" className="text-sm font-medium">{t('ui.location.type')}</label><select id="location-place-type" name="location-place-type" autoComplete="off" value={selectedPlaceType} onChange={e => setSelectedPlaceType(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"><option value="">{t('ui.location.selectType')}</option>{schema.types.map(item => <option key={item.type_key} value={item.type_key}>{placeTypeLabel(item.type_key, item.label, t)}</option>)}<option value="other">{t('ui.location.customType')}</option></select></div>
            </div>
            {selectedPlaceType === 'other' && <input id="location-custom-type" name="location-custom-type" autoComplete="off" value={customTypeLabel} onChange={e => setCustomTypeLabel(e.target.value)} placeholder={t('ui.location.customTypePlaceholder')} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring" />}
          </section>

          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div><h3 className="font-display font-semibold">{t('ui.location.containedIn')}</h3><p className="text-xs text-muted-foreground">{t('ui.location.containedInHint')}</p></div>
            <div className="flex flex-wrap gap-2">{containerOptions.map(option => <label key={option.id} className="flex items-center gap-2 border border-input rounded px-3 py-2 text-sm"><input id={`location-container-${option.id}`} name="location-containers" type="checkbox" checked={containerIds.includes(option.id)} onChange={e => setContainerIds(current => e.target.checked ? [...current, option.id] : current.filter(id => id !== option.id))} />{option.name}</label>)}</div>
            {containerOptions.length === 0 && <p className="text-xs text-muted-foreground">{t('ui.location.noOtherLocations')}</p>}
          </section>

          {groupedFields.map(([groupKey, groupFields]) => <section key={groupKey} className="rounded-lg border border-border bg-card"><button onClick={() => toggleGroup(groupKey)} className="w-full flex items-center justify-between p-4 hover:bg-muted/50"><h3 className="font-display font-semibold">{placeGroupLabel(groupKey, t)}</h3>{expandedGroups.has(groupKey) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>{expandedGroups.has(groupKey) && <div className="border-t p-4 grid grid-cols-1 md:grid-cols-2 gap-5">{groupFields.map(renderField)}</div>}</section>)}

          <section className="rounded-lg border border-dashed border-border p-4 space-y-3"><div><h3 className="font-display font-semibold">{t('ui.location.customField')}</h3><p className="text-xs text-muted-foreground">{t('ui.location.customFieldHint')}</p></div><div className="flex flex-col gap-2 sm:flex-row"><Input id="location-custom-field-label" name="location-custom-field-label" autoComplete="off" value={newFieldLabel} onChange={e => setNewFieldLabel(e.target.value)} placeholder={t('ui.location.fieldNamePlaceholder')} className="w-full sm:flex-1" /><Button variant="secondary" onClick={addCustomField} disabled={!newFieldLabel.trim()} className="w-full sm:w-auto"><Plus className="h-4 w-4" />{t('ui.location.addField')}</Button></div></section>
        </div>

        <div className="sticky bottom-0 bg-card border-t border-border p-4 sm:p-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {!isNewLocation && (showDeleteConfirm ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-destructive">{t('ui.location.deleteConfirm')}</span>
                <Button variant="destructive" size="sm" onClick={handleDelete} disabled={saving}>{t('ui.location.yes')}</Button>
                <Button variant="secondary" size="sm" onClick={() => setShowDeleteConfirm(false)}>{t('ui.location.no')}</Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={saving}
                className="text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
                {t('common.delete')}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={() => { setFormData(originalFormData); onClose() }} disabled={saving} className="flex-1 sm:flex-none">{t('ui.location.cancel')}</Button>
            <Button onClick={handleSave} disabled={saving || loadingSchema} className="flex-1 sm:flex-none">
              <Save className="h-4 w-4" />
              {saving ? t('ui.location.saving') : t('ui.location.save')}
            </Button>
          </div>
        </div>
      </div>
    </div>
    </>, mountNode,
  )
}
