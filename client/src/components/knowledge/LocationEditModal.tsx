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
          alert('יש להזין סוג מקום מותאם אישית')
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
        if (field.is_required && isEmpty) requiredMissing.push(field.label)
        if (field.field_type === 'multi_select') {
          structuredFields[field.field_key] = isEmpty ? null : parseMultiSelectValue(rawValue)
        } else {
          structuredFields[field.field_key] = rawValue && rawValue.trim() ? rawValue.trim() : null
        }
      }
      if (requiredMissing.length > 0) {
        alert(`יש למלא את השדות החובה: ${requiredMissing.join(', ')}`)
        return
      }
      const locationName = String(structuredFields.name || '').trim()
      if (!locationName) {
        alert(t('entityModal.nameRequired') || 'Location name is required')
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
      alert('שמירת המקום נכשלה')
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
          alert('יש להזין סוג מקום מותאם אישית לפני הוספת שדה')
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
          {field.label} {field.is_required && <span className="text-red-600">*</span>}
        </label>
        {field.field_type === 'boolean' ? (
          <select id={field.field_key} value={value} onChange={e => setValue(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-md bg-background">
            <option value="">לא ידוע</option><option value="true">כן</option><option value="false">לא</option>
          </select>
        ) : field.field_type === 'select' ? (
          <select id={field.field_key} value={value} onChange={e => setValue(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-md bg-background">
            <option value="">בחר</option>{field.options.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        ) : field.field_type === 'multi_select' ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {field.options.map(option => {
              const selected = parseMultiSelectValue(value).includes(option)
              return <label key={option} className="flex items-center gap-2 border rounded px-2 py-1 text-sm"><input type="checkbox" checked={selected} onChange={e => {
                const next = new Set(parseMultiSelectValue(value))
                e.target.checked ? next.add(option) : next.delete(option)
                setValue(JSON.stringify([...next]))
              }} />{option}</label>
            })}
          </div>
        ) : isLong ? (
          <textarea id={field.field_key} value={value} onChange={e => setValue(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-md bg-background resize-none" rows={3} />
        ) : (
          <input id={field.field_key} type={field.field_type === 'number' ? 'number' : 'text'} value={value} onChange={e => setValue(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-md bg-background" />
        )}
      </div>
    )
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-background rounded-lg shadow-lg max-w-4xl w-full max-h-[92vh] overflow-auto">
        <div className="sticky top-0 bg-background border-b p-6 flex items-start justify-between z-10">
          <div><h2 className="text-2xl font-bold">{isNewLocation ? 'מקום חדש' : 'עריכת מקום'}</h2><p className="text-sm text-muted-foreground mt-1">{location?.name || 'מקום'}</p></div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted"><X className="h-6 w-6" /></button>
        </div>

        <div className="p-6 space-y-6">
          {loadingSchema ? <p className="text-sm text-muted-foreground">טוען את מבנה המקום…</p> : null}
          <section className="border rounded-lg p-4 space-y-4">
            <h3 className="font-semibold">זהות המקום</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">שם המקום *</label><input value={formData.name || ''} onChange={e => setFormData(current => ({ ...current, name: e.target.value || null }))} className="mt-1 w-full px-3 py-2 border rounded-md bg-background" /></div>
              <div><label className="text-sm font-medium">סוג המקום</label><select value={selectedPlaceType} onChange={e => setSelectedPlaceType(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-md bg-background"><option value="">בחר סוג</option>{schema.types.map(item => <option key={item.type_key} value={item.type_key}>{item.label}</option>)}<option value="other">אחר — סוג חדש</option></select></div>
            </div>
            {selectedPlaceType === 'other' && <input value={customTypeLabel} onChange={e => setCustomTypeLabel(e.target.value)} placeholder="לדוגמה: ממלכה קסומה או ממד כיס" className="w-full px-3 py-2 border rounded-md bg-background" />}
          </section>

          <section className="border rounded-lg p-4 space-y-3">
            <div><h3 className="font-semibold">נמצא בתוך</h3><p className="text-xs text-muted-foreground">בחר רק מקומות שמכילים את המקום הזה. אין חובה להשלים את כל הרמות.</p></div>
            <div className="flex flex-wrap gap-2">{containerOptions.map(option => <label key={option.id} className="flex items-center gap-2 border rounded px-3 py-2 text-sm"><input type="checkbox" checked={containerIds.includes(option.id)} onChange={e => setContainerIds(current => e.target.checked ? [...current, option.id] : current.filter(id => id !== option.id))} />{option.name}</label>)}</div>
            {containerOptions.length === 0 && <p className="text-xs text-muted-foreground">אין עדיין מקומות אחרים לבחירה.</p>}
          </section>

          {groupedFields.map(([groupKey, groupFields]) => <section key={groupKey} className="border rounded-lg"><button onClick={() => toggleGroup(groupKey)} className="w-full flex items-center justify-between p-4 hover:bg-muted/50"><h3 className="font-semibold">{groupKey}</h3>{expandedGroups.has(groupKey) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>{expandedGroups.has(groupKey) && <div className="border-t p-4 grid grid-cols-1 md:grid-cols-2 gap-5">{groupFields.map(renderField)}</div>}</section>)}

          <section className="border border-dashed rounded-lg p-4 space-y-3"><div><h3 className="font-semibold">שדה מותאם אישית</h3><p className="text-xs text-muted-foreground">הוסף שדה חדש שיופיע עבור סוג המקום הזה ויישמר גם לחילוץ עתידי.</p></div><div className="flex gap-2"><input value={newFieldLabel} onChange={e => setNewFieldLabel(e.target.value)} placeholder="שם השדה, לדוגמה: מקור קסום" className="flex-1 px-3 py-2 border rounded-md bg-background" /><button onClick={addCustomField} disabled={!newFieldLabel.trim()} className="flex items-center gap-1 px-3 py-2 border rounded-md disabled:opacity-50"><Plus className="h-4 w-4" />הוסף</button></div></section>
        </div>

        <div className="sticky bottom-0 bg-background border-t p-6 flex items-center justify-between gap-3"><div>{!isNewLocation && (showDeleteConfirm ? <div className="flex items-center gap-2"><span className="text-sm text-red-600">למחוק את המקום?</span><button onClick={handleDelete} disabled={saving} className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-md">כן</button><button onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1.5 text-sm bg-muted rounded-md">לא</button></div> : <button onClick={() => setShowDeleteConfirm(true)} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-md"><Trash2 className="h-4 w-4" />מחק</button>)}</div><div className="flex items-center gap-3"><button onClick={() => { setFormData(originalFormData); onClose() }} disabled={saving} className="px-4 py-2 rounded-md border">ביטול</button><button onClick={handleSave} disabled={saving || loadingSchema} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'שומר…' : 'שמור'}</button></div></div>
      </div>
    </div>, mountNode,
  )
}
