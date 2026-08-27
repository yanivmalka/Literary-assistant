import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Edit3, Save } from 'lucide-react'
import { useEntityStore } from '@/stores/entityStore'
import { useBranchStore } from '@/stores/branchStore'
import {
  getFieldGroupsForType,
  getFieldsForType,
  TEXTAREA_FIELDS,
} from '@/lib/entityTypes'
import ProjectBreadcrumb from '@/components/ProjectBreadcrumb'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import type { ExtractionModelProfile } from '@/lib/extractionModels'
import { EXTRACTION_MODEL_PROFILES, getStoredExtractionModelProfile } from '@/lib/extractionModels'
import {
  getCatalogCharacterField,
  getCharacterAppearanceSummaries,
  getPopulatedCharacterFields,
  isDynamicCharacterProfile,
  isPopulatedCharacterField,
  loadCharacterFieldSchema,
  normalizeCharacterGroupKey,
  type CharacterFieldDefinition,
} from '@/lib/characterSchema'
import CharacterEditModal from '@/components/knowledge/CharacterEditModal'
import RelationshipPanel from '@/components/entities/RelationshipPanel'
import { getEntityRelationships, createBranchRelationship, reviewBranchRelationship, removeBranchRelationship } from '@/lib/relationshipService'
import type { Relationship } from '@/lib/relationshipService'

type ViewMode = 'profile' | 'edit'

interface FormData {
  [key: string]: string | null
}

export default function CharacterProfilePage() {
  const { t } = useTranslation()
  const { projectId, entityId } = useParams<{ projectId: string; entityId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedProfile = searchParams.get('profile')
  const modelProfile: ExtractionModelProfile = EXTRACTION_MODEL_PROFILES.includes(requestedProfile as ExtractionModelProfile)
    ? requestedProfile as ExtractionModelProfile
    : getStoredExtractionModelProfile()
  const { fetchEntities, updateEntity, getMainOnlyEntities, getEffectiveBranchEntities } = useEntityStore()
  const { currentBranch, fetchCurrentBranch } = useBranchStore()

  const [viewMode, setViewMode] = useState<ViewMode>('profile')
  const [formData, setFormData] = useState<FormData>({})
  const [originalFormData, setOriginalFormData] = useState<FormData>({})
  const [saving, setSaving] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState<'main' | 'branch'>('main')
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [loadingRelationships, setLoadingRelationships] = useState(false)
  const [dynamicFields, setDynamicFields] = useState<CharacterFieldDefinition[]>([])
  const [editModalOpen, setEditModalOpen] = useState(false)

  // Resolve entity from version-specific dataset
  const versionEntities = selectedVersion === 'main'
    ? getMainOnlyEntities()
    : getEffectiveBranchEntities()
  const entity = versionEntities.find(e => e.id === entityId)
  const entityType = entity?.entity_type as any
  const isDynamicProfile = isDynamicCharacterProfile(modelProfile)

  const visibleDynamicDefinitions = useMemo(() => {
    if (!isDynamicProfile || !entity) return []
    const fields = new Map(dynamicFields.map(field => [field.field_key, field]))
    for (const field of getPopulatedCharacterFields(entity, modelProfile, dynamicFields)) {
      fields.set(field.key, field.definition)
    }
    return [...fields.values()].sort((a, b) => a.sort_order - b.sort_order)
  }, [dynamicFields, entity, isDynamicProfile, modelProfile])

  const fieldGroups = useMemo(
    () => {
      if (!entity) return []
      if (!isDynamicProfile) return getFieldGroupsForType(entityType)
      const groups = new Map<string, string[]>()
      const populatedKeys = new Set(
        getPopulatedCharacterFields(entity, modelProfile, dynamicFields).map(field => field.key.trim()),
      )
      groups.set('זהות', ['name', 'first_name'])
      for (const field of visibleDynamicDefinitions) {
        const fieldKey = field.field_key.trim()
        // first_name is already rendered in the explicit identity group above.
        if (fieldKey === 'first_name') continue
        const groupKey = normalizeCharacterGroupKey(field.group_key)
        const group = groups.get(groupKey) || []
        if (!group.includes(fieldKey)) group.push(fieldKey)
        groups.set(groupKey, group)
      }
      return [...groups.entries()]
        .filter(([, fields]) => fields.some(field => field === 'name' || field === 'first_name' || populatedKeys.has(field)))
        .map(([key, fields]) => ({ key, labelKey: '', fields }))
    },
    [entity, entityType, isDynamicProfile, visibleDynamicDefinitions]
  )
  const allFields = useMemo(
    () => entity
      ? isDynamicProfile
        ? ['name', 'first_name', ...visibleDynamicDefinitions.filter(field => field.field_key !== 'first_name').map(field => field.field_key)]
        : getFieldsForType(entityType)
      : [],
    [entity, entityType, isDynamicProfile, visibleDynamicDefinitions]
  )

  useEffect(() => {
    if (!projectId) return
    fetchEntities(projectId, undefined, modelProfile)
    fetchCurrentBranch(projectId, modelProfile).then(branch => {
      if (branch) setSelectedVersion('branch')
    })
  }, [projectId, modelProfile, fetchEntities, fetchCurrentBranch])

  useEffect(() => {
    if (!projectId || !isDynamicProfile) {
      setDynamicFields([])
      return
    }
    loadCharacterFieldSchema(projectId, modelProfile)
      .then(setDynamicFields)
      .catch(error => {
        console.error('Failed to load character field schema:', error)
        setDynamicFields([])
      })
  }, [isDynamicProfile, modelProfile, projectId])

  // Load relationships
  useEffect(() => {
    if (!projectId || !entityId) return
    
    setLoadingRelationships(true)
    getEntityRelationships(entityId, projectId, selectedVersion === 'branch' ? currentBranch?.id : undefined)
      .then(rels => setRelationships(rels))
      .catch(err => console.error('Failed to load relationships:', err))
      .finally(() => setLoadingRelationships(false))
  }, [projectId, entityId, selectedVersion, currentBranch?.id])

  // Initialize form data from entity
  // Depends only on entity itself, not on allFields.
  // This ensures form is reinitialized only when a different entity is opened,
  // not when user types (which would trigger a render but not change entity).
  useEffect(() => {
    if (!entity) return

    const data: FormData = {}
    const structured = (entity.structured_fields || {}) as Record<string, unknown>
    const attributes = (entity.attributes || {}) as Record<string, unknown>
    for (const field of allFields) {
      const value = structured[field] ?? attributes[field] ?? (field === 'name' ? entity.name : field === 'aliases' ? entity.aliases : null)
      data[field] = value != null ? (Array.isArray(value) ? JSON.stringify(value) : String(value)) : null
    }
    setFormData(data)
    setOriginalFormData(data)
  }, [entity])

  if (!projectId || !entityId) {
    return <div className="text-center py-12">{t('common.loading')}</div>
  }

  if (!entity) {
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(`/projects/${projectId}/knowledge`)}
          className="mb-4"
        >
          <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
        </Button>
        <p className="text-center text-muted-foreground">{t('common.notFound')}</p>
      </div>
    )
  }

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
        canonical_name: structuredFields.name as string || entity.name,
        description: (structuredFields.description as string) || null,
        structured_fields: structuredFields,
      }

      // Route based on selectedVersion, not currentBranch existence
      const branchContext = selectedVersion === 'branch' && currentBranch
        ? { branchId: currentBranch.id, sourceEntityId: entityId }
        : undefined

      const success = await updateEntity(entityId, updates, branchContext)

      // Only leave edit mode if save succeeded
      if (success) {
        setOriginalFormData(formData)
        setViewMode('profile')
      } else {
        // Save failed; remain in edit mode with user's data intact
        console.error('Failed to save entity changes')
        // Note: formData is already in state, so user sees their edits intact
      }
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setFormData(originalFormData)
    setViewMode('profile')
  }

  const handleEdit = () => {
    setEditModalOpen(true)
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      <ProjectBreadcrumb currentPage="entities" showTabs={false} />

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-6">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => navigate(`/projects/${projectId}/knowledge`)}
          >
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </Button>
          <div className="min-w-0">
            <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight break-words">{entity.name}</h1>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
              {t('entities.typesSingular.character')}
              {currentBranch && (
                <Badge variant="accent">{currentBranch.name}</Badge>
              )}
            </p>
          </div>
        </div>

        {viewMode === 'profile' && (
          <Button onClick={handleEdit} size="sm" className="shrink-0">
            <Edit3 className="h-4 w-4" />
            {t('common.edit')}
          </Button>
        )}
      </div>

      {/* Version Selection */}
      {currentBranch && viewMode === 'profile' && (
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t('branch.version')}:</span>
            <button
              onClick={() => setSelectedVersion('main')}
              className={`px-3 py-1 rounded-md text-sm font-semibold transition-colors ${
                selectedVersion === 'main'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {t('branch.main')}
            </button>
            <button
              onClick={() => setSelectedVersion('branch')}
              className={`px-3 py-1 rounded-md text-sm font-semibold transition-colors ${
                selectedVersion === 'branch'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {currentBranch.name}
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <Card className="p-4 sm:p-6">
        {fieldGroups.map(group => {
          const appearanceSummaries = isDynamicProfile && viewMode === 'profile' && group.key === 'מראה חיצוני'
            ? getCharacterAppearanceSummaries(entity, modelProfile, dynamicFields)
            : []
          const hiddenAppearanceFields = appearanceSummaries.length > 0
            ? new Set(['hair_color', 'hair_type', 'eye_color', 'eye_shape', 'eye_size'])
            : new Set<string>()
          const renderFields = [
            ...group.fields
              .filter(field => !hiddenAppearanceFields.has(field as string))
              .map(field => ({ fieldKey: field as string, summaryValue: null as string | null })),
            ...appearanceSummaries.map(summary => ({ fieldKey: summary.key, summaryValue: summary.value })),
          ]
          const populatedValues = new Map(
            getPopulatedCharacterFields(entity, modelProfile, dynamicFields)
              .map(field => [field.key.trim(), field.value] as const),
          )
          const visibleFields = viewMode === 'profile' && isDynamicProfile
            ? renderFields.filter(({ fieldKey, summaryValue }) => summaryValue !== null
              ? summaryValue.trim().length > 0
              : fieldKey === 'name'
                ? entity.name.trim().length > 0
                : isPopulatedCharacterField(populatedValues.get(fieldKey)))
            : renderFields

          if (visibleFields.length === 0) return null

          return (
            <div key={group.key} className="mb-8 last:mb-0">
              <h3 className="font-display text-base font-semibold mb-4 text-muted-foreground">
                {isDynamicProfile
                  ? t(`entityFields.dynamic.groups.${group.key === 'זהות' ? 'identity' : group.key === 'תכונות' ? 'traits' : group.key === 'מראה חיצוני' ? 'appearance' : group.key === 'עולם הדמות' ? 'world' : group.key === 'שדות מותאמים אישית' ? 'custom' : 'analysis'}`, { defaultValue: group.key })
                  : t(group.labelKey)}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {renderFields.map(({ fieldKey, summaryValue }) => {
                  const value = formData[fieldKey] ?? ''
                  const dynamicDefinition = dynamicFields.find(item => item.field_key === fieldKey) || getCatalogCharacterField(fieldKey)
                  const populatedValue = summaryValue ?? (isDynamicProfile
                    ? getPopulatedCharacterFields(entity, modelProfile, dynamicFields).find(item => item.key === fieldKey)?.value
                    : value)
                  const displayValue = Array.isArray(populatedValue) ? populatedValue.join(', ') : populatedValue == null ? '' : String(populatedValue)
                  const isTextarea = dynamicDefinition?.field_type === 'long_text' || TEXTAREA_FIELDS.has(fieldKey)
                  const fieldLabel = summaryValue !== null
                    ? t(`entityFields.dynamic.${fieldKey}`, { defaultValue: fieldKey === 'hair_summary' ? 'שיער' : 'עיניים' })
                    : isDynamicProfile && dynamicDefinition
                      ? t(`entityFields.dynamic.${fieldKey}`, { defaultValue: dynamicDefinition.label || fieldKey })
                      : t(`entityFields.${fieldKey}`, { defaultValue: fieldKey })

                  if (viewMode === 'profile') {
                    if (isDynamicProfile && !displayValue.trim()) return null
                    return (
                      <div key={fieldKey}>
                        <span className="text-sm font-medium text-muted-foreground">{fieldLabel}</span>
                        <div className="mt-1 p-2 rounded-md bg-muted/50 min-h-[2.5rem] flex items-center">
                          <p className={displayValue ? '' : 'text-muted-foreground italic'}>
                            {displayValue || t('ui.common.unknown')}
                          </p>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div key={fieldKey}>
                      <label className="text-sm font-medium" htmlFor={fieldKey}>
                        {fieldLabel}
                      </label>
                      {isTextarea ? (
                        <textarea
                          id={fieldKey}
                          name={fieldKey}
                          autoComplete="off"
                          value={value}
                          onChange={e => handleFieldChange(fieldKey, e.target.value)}
                          className="mt-1 w-full px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
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
                          className="mt-1 w-full h-10 px-3 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </Card>

      {/* Action buttons in edit mode */}
      {viewMode === 'edit' && (
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={handleCancel}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      )}

      {/* Relationships */}
      <div className="mt-10 border-t border-border pt-6">
        {loadingRelationships ? (
          <p className="text-center text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <RelationshipPanel
            entity={{ id: entity.id, name: entity.name, entity_type: entity.entity_type }}
            relationships={relationships}
            allEntities={versionEntities}
            branchId={selectedVersion === 'branch' ? currentBranch?.id : undefined}
            isEditMode={viewMode === 'edit'}
            onAddRelationship={async (targetId, type) => {
              if (!currentBranch) {
                console.error('No active branch')
                return
              }
              try {
                const newRel = await createBranchRelationship(
                  projectId!,
                  entity.id,
                  targetId,
                  type,
                  currentBranch.id
                )
                setRelationships([...relationships, newRel])
              } catch (err) {
                console.error('Failed to create relationship:', err)
              }
            }}
            onReviewRelationship={async (relId, approved) => {
              try {
                await reviewBranchRelationship(relId, approved)
                setRelationships(
                  relationships.map(r =>
                    r.id === relId ? { ...r, review_status: approved ? 'approved' : 'rejected' } : r
                  )
                )
              } catch (err) {
                console.error('Failed to review relationship:', err)
              }
            }}
            onRemoveRelationship={async (relId) => {
              if (!currentBranch) {
                console.error('No active branch')
                return
              }
              try {
                const removalRel = await removeBranchRelationship(relId, currentBranch.id)
                setRelationships([...relationships, removalRel])
              } catch (err) {
                console.error('Failed to remove relationship:', err)
              }
            }}
          />
        )}
      </div>
      {editModalOpen && (
        <CharacterEditModal
          isOpen={editModalOpen}
          character={entity}
          projectId={projectId}
          selectedVersion={selectedVersion}
          modelProfile={modelProfile}
          onClose={() => setEditModalOpen(false)}
          onCharacterUpdated={() => {
            setEditModalOpen(false)
            void fetchEntities(projectId, undefined, modelProfile)
          }}
        />
      )}
    </div>
  )
}
