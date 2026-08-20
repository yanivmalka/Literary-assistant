import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Edit3, Save } from 'lucide-react'
import { useEntityStore } from '@/stores/entityStore'
import { useBranchStore } from '@/stores/branchStore'
import {
  getFieldGroupsForType,
  getFieldsForType,
  TEXTAREA_FIELDS,
} from '@/lib/entityTypes'
import ProjectBreadcrumb from '@/components/ProjectBreadcrumb'
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
  
  const { fetchEntities, updateEntity, getMainOnlyEntities, getEffectiveBranchEntities } = useEntityStore()
  const { currentBranch, fetchCurrentBranch } = useBranchStore()

  const [viewMode, setViewMode] = useState<ViewMode>('profile')
  const [formData, setFormData] = useState<FormData>({})
  const [originalFormData, setOriginalFormData] = useState<FormData>({})
  const [saving, setSaving] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState<'main' | 'branch'>('main')
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [loadingRelationships, setLoadingRelationships] = useState(false)

  // Resolve entity from version-specific dataset
  const versionEntities = selectedVersion === 'main'
    ? getMainOnlyEntities()
    : getEffectiveBranchEntities()
  const entity = versionEntities.find(e => e.id === entityId)
  const entityType = entity?.entity_type as any

  // Memoize field lists so they only change when entity type actually changes,
  // not on every render. This prevents form reinitialization while user is typing.
  const fieldGroups = useMemo(
    () => entity ? getFieldGroupsForType(entityType) : [],
    [entityType]
  )
  const allFields = useMemo(
    () => entity ? getFieldsForType(entityType) : [],
    [entityType]
  )

  // Initialize entity and branch state on mount
  useEffect(() => {
    if (projectId) {
      fetchEntities(projectId)
      fetchCurrentBranch(projectId).then(branch => {
        // If a branch exists, default to branch view; otherwise stay on main
        if (branch) {
          setSelectedVersion('branch')
        }
      })
    }
  }, [projectId, fetchEntities, fetchCurrentBranch])

  // Load relationships
  useEffect(() => {
    if (!projectId || !entityId) return
    
    setLoadingRelationships(true)
    getEntityRelationships(entityId, projectId, currentBranch?.id)
      .then(rels => setRelationships(rels))
      .catch(err => console.error('Failed to load relationships:', err))
      .finally(() => setLoadingRelationships(false))
  }, [projectId, entityId, currentBranch?.id])

  // Initialize form data from entity
  // Depends only on entity itself, not on allFields.
  // This ensures form is reinitialized only when a different entity is opened,
  // not when user types (which would trigger a render but not change entity).
  useEffect(() => {
    if (!entity) return

    const data: FormData = {}
    // Use allFields value that was memoized based on entityType
    for (const field of allFields) {
      const value = (entity.structured_fields as Record<string, unknown>)?.[field]
      data[field] = value != null ? String(value) : null
    }
    setFormData(data)
    setOriginalFormData(data)
  }, [entity])

  if (!projectId || !entityId) {
    return <div className="text-center py-12">{t('common.loading')}</div>
  }

  if (!entity) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <button
          onClick={() => navigate(`/projects/${projectId}/knowledge`)}
          className="p-2 rounded-md hover:bg-accent transition-colors mb-4"
        >
          <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
        </button>
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
    setViewMode('edit')
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <ProjectBreadcrumb currentPage="entities" showTabs={false} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/projects/${projectId}/knowledge`)}
            className="p-2 rounded-md hover:bg-accent transition-colors"
          >
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">{entity.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t('entities.typesSingular.character')}
              {currentBranch && (
                <span className="ml-2 text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
                  {currentBranch.name}
                </span>
              )}
            </p>
          </div>
        </div>

        {viewMode === 'profile' && (
          <button
            onClick={handleEdit}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors"
          >
            <Edit3 className="h-4 w-4" />
            {t('entityModal.edit')}
          </button>
        )}
      </div>

      {/* Version Selection */}
      {currentBranch && viewMode === 'profile' && (
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t('branch.version')}:</span>
            <button
              onClick={() => setSelectedVersion('main')}
              className={`px-3 py-1 rounded-md text-sm transition-colors ${
                selectedVersion === 'main'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              {t('branch.main')}
            </button>
            <button
              onClick={() => setSelectedVersion('branch')}
              className={`px-3 py-1 rounded-md text-sm transition-colors ${
                selectedVersion === 'branch'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              {currentBranch.name}
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="border rounded-lg p-6 bg-card">
        {fieldGroups.map(group => (
          <div key={group.key} className="mb-8 last:mb-0">
            <h3 className="text-lg font-semibold mb-4 text-muted-foreground">
              {t(group.labelKey)}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {group.fields.map(field => {
                const value = formData[field as string] ?? ''
                const isTextarea = TEXTAREA_FIELDS.has(field as string)
                const fieldLabel = t(`entityFields.${field}`, { defaultValue: field })

                if (viewMode === 'profile') {
                  // Read-only mode
                  return (
                    <div key={field}>
                      <label className="text-sm font-medium text-muted-foreground">
                        {fieldLabel}
                      </label>
                      <div className="mt-1 p-2 rounded bg-muted/50 min-h-[2.5rem] flex items-center">
                        <p className={value ? '' : 'text-muted-foreground italic'}>
                          {value || t('ui.common.unknown')}
                        </p>
                      </div>
                    </div>
                  )
                } else {
                  // Edit mode
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
                }
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Action buttons in edit mode */}
      {viewMode === 'edit' && (
        <div className="flex justify-end gap-3 mt-6">
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
      )}

      {/* Relationships */}
      <div className="mt-10 border-t pt-6">
        {loadingRelationships ? (
          <p className="text-center text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <RelationshipPanel
            entity={{ id: entity.id, name: entity.name, entity_type: entity.entity_type }}
            relationships={relationships}
            allEntities={versionEntities}
            branchId={currentBranch?.id}
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
    </div>
  )
}
