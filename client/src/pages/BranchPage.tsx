import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { GitBranch, Plus, ArrowRight, Check, Edit3, X, Save, RefreshCw } from 'lucide-react'
import { useBranchStore, type BranchEntity, type EntityComparison } from '@/stores/branchStore'
import ProjectBreadcrumb from '@/components/ProjectBreadcrumb'

type ViewMode = 'main' | 'branch' | 'compare'

export default function BranchPage() {
  const { t } = useTranslation()
  const { projectId } = useParams<{ projectId: string }>()
  const {
    currentBranch,
    branchEntities,
    mainEntities,
    comparisons,
    loading,
    error,
    fetchBranches,
    fetchMainEntities,
    fetchBranchEntities,
    createBranch,
    updateBranchEntity,
    compareEntities,
    transferFieldToMain,
    transferAllToMain,
    archiveBranch,
    clearError,
  } = useBranchStore()

  const [viewMode, setViewMode] = useState<ViewMode>('main')
  const [editingEntity, setEditingEntity] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ canonical_name: string; description: string; attributes: Record<string, unknown> }>({
    canonical_name: '',
    description: '',
    attributes: {},
  })
  const [newBranchName, setNewBranchName] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  useEffect(() => {
    if (projectId) {
      fetchBranches(projectId)
      fetchMainEntities(projectId)
    }
  }, [projectId, fetchBranches, fetchMainEntities])

  useEffect(() => {
    if (currentBranch) {
      fetchBranchEntities(currentBranch.id)
    }
  }, [currentBranch, fetchBranchEntities])

  if (!projectId) return null

  // ==============================
  // Handlers
  // ==============================

  const handleCreateBranch = async () => {
    const name = newBranchName.trim() || undefined
    await createBranch(projectId, name)
    setShowCreateDialog(false)
    setNewBranchName('')
    setViewMode('branch')
  }

  const handleNewBranch = async () => {
    if (currentBranch) {
      await archiveBranch(currentBranch.id)
    }
    setShowCreateDialog(true)
  }

  const handleCompare = async () => {
    if (!currentBranch) return
    await compareEntities(currentBranch.id, projectId)
    setViewMode('compare')
  }

  const handleStartEdit = (entity: BranchEntity) => {
    setEditingEntity(entity.id)
    setEditForm({
      canonical_name: entity.canonical_name,
      description: entity.description || '',
      attributes: { ...(entity.attributes || {}) },
    })
  }

  const handleSaveEdit = async () => {
    if (!editingEntity) return
    await updateBranchEntity(editingEntity, {
      canonical_name: editForm.canonical_name,
      description: editForm.description || null,
      attributes: editForm.attributes,
    })
    setEditingEntity(null)
    // Refresh comparison if in compare view
    if (viewMode === 'compare' && currentBranch) {
      await compareEntities(currentBranch.id, projectId)
    }
  }

  const handleCancelEdit = () => {
    setEditingEntity(null)
  }

  const handleTransferField = async (sourceEntityId: string, field: string, branchValue: unknown) => {
    await transferFieldToMain(sourceEntityId, field, branchValue)
  }

  const handleTransferAll = async (sourceEntityId: string) => {
    await transferAllToMain(sourceEntityId)
  }

  const handleAttributeChange = (key: string, value: string) => {
    setEditForm(prev => ({
      ...prev,
      attributes: { ...prev.attributes, [key]: value },
    }))
  }

  // ==============================
  // Render helpers
  // ==============================

  const renderEntityTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      character: '👤',
      location: '📍',
      object: '🗡️',
      ability: '✨',
      organization: '🏛️',
    }
    return icons[type] || '📋'
  }

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '—'
    if (typeof value === 'string') return value
    if (Array.isArray(value)) return value.join(', ')
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  const formatFieldName = (field: string): string => {
    if (field === 'canonical_name') return t('branch.fields.name')
    if (field === 'description') return t('branch.fields.description')
    if (field.startsWith('attributes.')) return field.replace('attributes.', '')
    return field
  }

  // ==============================
  // Main entities view
  // ==============================

  const renderMainView = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">{t('branch.mainEntities')}</h3>
        <span className="text-sm text-muted-foreground">{mainEntities.length} {t('branch.entities')}</span>
      </div>
      {mainEntities.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground">{t('branch.noMainEntities')}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {mainEntities.map(entity => (
            <div key={entity.id} className="border rounded-lg p-4 bg-card">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{renderEntityTypeIcon(entity.entity_type)}</span>
                <h4 className="font-medium">{entity.canonical_name}</h4>
                <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">Main</span>
              </div>
              {entity.description && (
                <p className="text-sm text-muted-foreground mb-2">{entity.description}</p>
              )}
              {entity.attributes && Object.keys(entity.attributes).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(entity.attributes).map(([key, val]) => (
                    <span key={key} className="text-xs bg-muted px-2 py-1 rounded">
                      <span className="font-medium">{key}:</span> {formatValue(val)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // ==============================
  // Branch entities view (editable)
  // ==============================

  const renderBranchView = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">
          {currentBranch?.name || t('branch.branch')}
        </h3>
        <span className="text-sm text-muted-foreground">{branchEntities.length} {t('branch.entities')}</span>
      </div>
      {branchEntities.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground">{t('branch.noBranchEntities')}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {branchEntities.map(entity => (
            <div key={entity.id} className={`border rounded-lg p-4 bg-card ${entity.is_modified ? 'border-amber-300' : ''}`}>
              {editingEntity === entity.id ? (
                // Edit mode
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">{t('branch.fields.name')}</label>
                    <input
                      type="text"
                      value={editForm.canonical_name}
                      onChange={e => setEditForm(prev => ({ ...prev, canonical_name: e.target.value }))}
                      className="w-full mt-1 px-3 py-1.5 border rounded-md text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">{t('branch.fields.description')}</label>
                    <textarea
                      value={editForm.description}
                      onChange={e => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full mt-1 px-3 py-1.5 border rounded-md text-sm"
                      rows={2}
                    />
                  </div>
                  {Object.entries(editForm.attributes).map(([key, val]) => (
                    <div key={key}>
                      <label className="text-xs font-medium text-muted-foreground">{key}</label>
                      <input
                        type="text"
                        value={formatValue(val)}
                        onChange={e => handleAttributeChange(key, e.target.value)}
                        className="w-full mt-1 px-3 py-1.5 border rounded-md text-sm"
                      />
                    </div>
                  ))}
                  <div className="flex gap-2 pt-2">
                    <button onClick={handleSaveEdit} className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90">
                      <Save className="h-3.5 w-3.5" />
                      {t('common.save')}
                    </button>
                    <button onClick={handleCancelEdit} className="flex items-center gap-1 px-3 py-1.5 bg-muted rounded-md text-sm hover:bg-muted/80">
                      <X className="h-3.5 w-3.5" />
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                // View mode
                <>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{renderEntityTypeIcon(entity.entity_type)}</span>
                      <h4 className="font-medium">{entity.canonical_name}</h4>
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Branch</span>
                      {entity.is_modified && (
                        <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">{t('branch.modified')}</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleStartEdit(entity)}
                      className="p-1.5 rounded hover:bg-muted transition-colors"
                      title={t('common.edit')}
                    >
                      <Edit3 className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                  {entity.description && (
                    <p className="text-sm text-muted-foreground mb-2">{entity.description}</p>
                  )}
                  {entity.attributes && Object.keys(entity.attributes).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(entity.attributes).map(([key, val]) => (
                        <span key={key} className="text-xs bg-muted px-2 py-1 rounded">
                          <span className="font-medium">{key}:</span> {formatValue(val)}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // ==============================
  // Comparison view
  // ==============================

  const renderCompareView = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">{t('branch.comparison')}</h3>
        <button
          onClick={handleCompare}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t('branch.refresh')}
        </button>
      </div>

      {comparisons.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground">{t('branch.noComparisons')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {comparisons.filter(c => c.hasChanges).length === 0 ? (
            <div className="text-center py-6 border rounded-lg bg-green-50">
              <Check className="h-6 w-6 text-green-600 mx-auto mb-2" />
              <p className="text-sm text-green-700">{t('branch.noChanges')}</p>
            </div>
          ) : (
            comparisons.filter(c => c.hasChanges).map(comparison => (
              <ComparisonCard
                key={comparison.sourceEntityId}
                comparison={comparison}
                onTransferField={handleTransferField}
                onTransferAll={handleTransferAll}
                t={t}
                formatValue={formatValue}
                formatFieldName={formatFieldName}
                renderEntityTypeIcon={renderEntityTypeIcon}
              />
            ))
          )}
        </div>
      )}
    </div>
  )

  // ==============================
  // Main render
  // ==============================

  return (
    <div className="max-w-4xl mx-auto p-6">
      <ProjectBreadcrumb currentPage="branches" showTabs={false} />

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <GitBranch className="h-5 w-5" />
          <h2 className="text-xl font-bold">{t('branch.title')}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{t('branch.subtitle')}</p>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={clearError} className="text-red-500 hover:text-red-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Branch status & actions */}
      <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-muted/30 rounded-lg border">
        {currentBranch ? (
          <>
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium">{currentBranch.name}</span>
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">{t('branch.active')}</span>
            </div>
            <div className="flex gap-2 ms-auto">
              <button
                onClick={handleNewBranch}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-md hover:bg-muted transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('branch.newBranch')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t('branch.noBranch')}</p>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 ms-auto"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('branch.createBranch')}
            </button>
          </>
        )}
      </div>

      {/* Create branch dialog */}
      {showCreateDialog && (
        <div className="mb-6 p-4 border-2 border-primary/20 rounded-lg bg-card">
          <h4 className="font-medium mb-3">{t('branch.createBranch')}</h4>
          <input
            type="text"
            placeholder={t('branch.branchNamePlaceholder')}
            value={newBranchName}
            onChange={e => setNewBranchName(e.target.value)}
            className="w-full px-3 py-2 border rounded-md text-sm mb-3"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreateBranch}
              disabled={loading}
              className="flex items-center gap-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {t('branch.create')}
            </button>
            <button
              onClick={() => setShowCreateDialog(false)}
              className="px-4 py-2 bg-muted rounded-md text-sm hover:bg-muted/80"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* View mode tabs */}
      <div className="flex gap-1 mb-6 border-b">
        <button
          onClick={() => setViewMode('main')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            viewMode === 'main' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('branch.viewMain')}
        </button>
        <button
          onClick={() => { setViewMode('branch'); }}
          disabled={!currentBranch}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors disabled:opacity-50 ${
            viewMode === 'branch' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('branch.viewBranch')}
        </button>
        <button
          onClick={handleCompare}
          disabled={!currentBranch}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors disabled:opacity-50 ${
            viewMode === 'compare' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('branch.viewCompare')}
        </button>
      </div>

      {/* Content */}
      {loading && viewMode !== 'branch' ? (
        <div className="text-center py-8">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-2">{t('common.loading')}</p>
        </div>
      ) : (
        <>
          {viewMode === 'main' && renderMainView()}
          {viewMode === 'branch' && renderBranchView()}
          {viewMode === 'compare' && renderCompareView()}
        </>
      )}
    </div>
  )
}

// ============================================
// Comparison Card Component
// ============================================

interface ComparisonCardProps {
  comparison: EntityComparison
  onTransferField: (sourceEntityId: string, field: string, branchValue: unknown) => void
  onTransferAll: (sourceEntityId: string) => void
  t: (key: string) => string
  formatValue: (value: unknown) => string
  formatFieldName: (field: string) => string
  renderEntityTypeIcon: (type: string) => string
}

function ComparisonCard({
  comparison,
  onTransferField,
  onTransferAll,
  t,
  formatValue,
  formatFieldName,
  renderEntityTypeIcon,
}: ComparisonCardProps) {
  const changedDiffs = comparison.diffs.filter(d => d.changed)

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Entity header */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-b">
        <div className="flex items-center gap-2">
          <span>{renderEntityTypeIcon(comparison.entityType)}</span>
          <span className="font-medium">{comparison.entityName}</span>
          <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
            {changedDiffs.length} {t('branch.changedFields')}
          </span>
        </div>
        <button
          onClick={() => onTransferAll(comparison.sourceEntityId)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          <ArrowRight className="h-3 w-3" />
          {t('branch.transferAll')}
        </button>
      </div>

      {/* Field comparison table */}
      <div className="divide-y">
        <div className="grid grid-cols-[1fr_2fr_2fr_auto] gap-2 px-4 py-2 bg-muted/20 text-xs font-medium text-muted-foreground">
          <span>{t('branch.field')}</span>
          <span>Main</span>
          <span>Branch</span>
          <span></span>
        </div>
        {changedDiffs.map(diff => (
          <div key={diff.field} className="grid grid-cols-[1fr_2fr_2fr_auto] gap-2 px-4 py-2.5 items-center">
            <span className="text-sm font-medium">{formatFieldName(diff.field)}</span>
            <span className="text-sm text-muted-foreground truncate" title={formatValue(diff.mainValue)}>
              {formatValue(diff.mainValue)}
            </span>
            <span className="text-sm text-blue-700 truncate" title={formatValue(diff.branchValue)}>
              {formatValue(diff.branchValue)}
            </span>
            <button
              onClick={() => onTransferField(comparison.sourceEntityId, diff.field, diff.branchValue)}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100 whitespace-nowrap"
              title={t('branch.transferToMain')}
            >
              <ArrowRight className="h-3 w-3" />
              {t('branch.transfer')}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
