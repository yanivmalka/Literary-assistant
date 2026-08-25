import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { GitBranch, Plus, ArrowRight, Check, Edit3, X, Save, RefreshCw } from 'lucide-react'
import { useBranchStore, type BranchEntity, type EntityComparison } from '@/stores/branchStore'
import ProjectBreadcrumb from '@/components/ProjectBreadcrumb'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'

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
      canonical_name: entity.canonical_name || '',
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
        <h3 className="font-display text-lg font-semibold tracking-tight">{t('branch.mainEntities')}</h3>
        <span className="text-sm text-muted-foreground">{mainEntities.length} {t('branch.entities')}</span>
      </div>
      {mainEntities.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-border rounded-lg">
          <p className="text-muted-foreground">{t('branch.noMainEntities')}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {mainEntities.map(entity => (
            <Card key={entity.id} className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{renderEntityTypeIcon(entity.entity_type)}</span>
                <h4 className="font-display font-semibold">{entity.canonical_name}</h4>
                <Badge variant="success">{t('ui.branch.main')}</Badge>
              </div>
              {entity.description && (
                <p className="text-sm text-muted-foreground mb-2">{entity.description}</p>
              )}
              {entity.attributes && Object.keys(entity.attributes).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(entity.attributes).map(([key, val]) => (
                    <span key={key} className="text-xs bg-muted px-2 py-1 rounded-md">
                      <span className="font-medium">{key}:</span> {formatValue(val)}
                    </span>
                  ))}
                </div>
              )}
            </Card>
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
        <h3 className="font-display text-lg font-semibold tracking-tight">
          {currentBranch?.name || t('branch.branch')}
        </h3>
        <span className="text-sm text-muted-foreground">{branchEntities.length} {t('branch.entities')}</span>
      </div>
      {branchEntities.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-border rounded-lg">
          <p className="text-muted-foreground">{t('branch.noBranchEntities')}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {branchEntities.map(entity => (
            <Card key={entity.id} className={`p-4 ${entity.is_modified ? 'border-warning/40' : ''}`}>
              {editingEntity === entity.id ? (
                // Edit mode
                <div className="space-y-3">
                  <div>
                    <label htmlFor={`edit-canonical-name-${entity.id}`} className="text-xs font-semibold text-muted-foreground">{t('branch.fields.name')}</label>
                    <Input
                      id={`edit-canonical-name-${entity.id}`}
                      name={`canonical-name-${entity.id}`}
                      type="text"
                      value={editForm.canonical_name}
                      onChange={e => setEditForm(prev => ({ ...prev, canonical_name: e.target.value }))}
                      className="mt-1 h-9"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label htmlFor={`edit-description-${entity.id}`} className="text-xs font-semibold text-muted-foreground">{t('branch.fields.description')}</label>
                    <textarea
                      id={`edit-description-${entity.id}`}
                      name={`description-${entity.id}`}
                      value={editForm.description}
                      onChange={e => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full mt-1 px-3 py-1.5 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
                      rows={2}
                      autoComplete="off"
                    />
                  </div>
                  {Object.entries(editForm.attributes).map(([key, val]) => (
                    <div key={key}>
                      <label htmlFor={`edit-attr-${key}`} className="text-xs font-semibold text-muted-foreground">{key}</label>
                      <Input
                        id={`edit-attr-${key}`}
                        name={`attribute-${key}`}
                        type="text"
                        value={formatValue(val)}
                        onChange={e => handleAttributeChange(key, e.target.value)}
                        className="mt-1 h-9"
                        autoComplete="off"
                      />
                    </div>
                  ))}
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" onClick={handleSaveEdit}>
                      <Save className="h-3.5 w-3.5" />
                      {t('common.save')}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={handleCancelEdit}>
                      <X className="h-3.5 w-3.5" />
                      {t('common.cancel')}
                    </Button>
                  </div>
                </div>
              ) : (
                // View mode
                <>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{renderEntityTypeIcon(entity.entity_type || '')}</span>
                      <h4 className="font-display font-semibold">{entity.canonical_name || ''}</h4>
                      <Badge variant="info">{t('ui.branch.branch')}</Badge>
                      {entity.is_modified && (
                        <Badge variant="warning">{t('branch.modified')}</Badge>
                      )}
                    </div>
                    <button
                      onClick={() => handleStartEdit(entity)}
                      className="p-1.5 rounded-md hover:bg-muted transition-colors"
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
                        <span key={key} className="text-xs bg-muted px-2 py-1 rounded-md">
                          <span className="font-medium">{key}:</span> {formatValue(val)}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </Card>
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
        <h3 className="font-display text-lg font-semibold tracking-tight">{t('branch.comparison')}</h3>
        <button
          onClick={handleCompare}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t('branch.refresh')}
        </button>
      </div>

      {comparisons.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-border rounded-lg">
          <p className="text-muted-foreground">{t('branch.noComparisons')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {comparisons.filter(c => c.hasChanges).length === 0 ? (
            <div className="text-center py-6 border border-border rounded-lg bg-success-soft">
              <Check className="h-6 w-6 text-success mx-auto mb-2" />
              <p className="text-sm text-success">{t('branch.noChanges')}</p>
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
          <GitBranch className="h-5 w-5 text-primary" />
          <h2 className="font-display text-xl font-semibold tracking-tight">{t('branch.title')}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{t('branch.subtitle')}</p>
      </div>
      <div className="lit-rule mb-5" />

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center justify-between">
          <p className="text-sm text-destructive">{error}</p>
          <button onClick={clearError} className="text-destructive hover:opacity-80">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Branch status & actions */}
      <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-muted/30 rounded-lg border border-border">
        {currentBranch ? (
          <>
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-info" />
              <span className="text-sm font-semibold">{currentBranch.name}</span>
              <Badge variant="info">{t('branch.active')}</Badge>
            </div>
            <div className="flex gap-2 ms-auto">
              <Button variant="secondary" size="sm" onClick={handleNewBranch}>
                <Plus className="h-3.5 w-3.5" />
                {t('branch.newBranch')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t('branch.noBranch')}</p>
            <Button size="sm" className="ms-auto" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t('branch.createBranch')}
            </Button>
          </>
        )}
      </div>

      {/* Create branch dialog */}
      {showCreateDialog && (
        <Card className="mb-6 p-4 border-primary/20">
          <h4 className="font-display font-semibold mb-3">{t('branch.createBranch')}</h4>
          <Input
            id="new-branch-name"
            name="branch-name"
            type="text"
            placeholder={t('branch.branchNamePlaceholder')}
            value={newBranchName}
            onChange={e => setNewBranchName(e.target.value)}
            className="mb-3"
            autoComplete="off"
            autoFocus
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreateBranch} disabled={loading}>
              {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {t('branch.create')}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowCreateDialog(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </Card>
      )}

      {/* View mode tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        <button
          onClick={() => setViewMode('main')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            viewMode === 'main' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('branch.viewMain')}
        </button>
        <button
          onClick={() => { setViewMode('branch'); }}
          disabled={!currentBranch}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors disabled:opacity-50 ${
            viewMode === 'branch' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('branch.viewBranch')}
        </button>
        <button
          onClick={handleCompare}
          disabled={!currentBranch}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors disabled:opacity-50 ${
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
    <Card className="overflow-hidden">
      {/* Entity header */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2">
          <span>{renderEntityTypeIcon(comparison.entityType)}</span>
          <span className="font-display font-semibold">{comparison.entityName}</span>
          <Badge variant="warning">
            {changedDiffs.length} {t('branch.changedFields')}
          </Badge>
        </div>
        <Button size="sm" onClick={() => onTransferAll(comparison.sourceEntityId)}>
          <ArrowRight className="h-3 w-3 rtl:rotate-180" />
          {t('branch.transferAll')}
        </Button>
      </div>

      {/* Field comparison table */}
      <div className="divide-y divide-border">
        <div className="grid grid-cols-[1fr_2fr_2fr_auto] gap-2 px-4 py-2 bg-muted/20 text-xs font-semibold text-muted-foreground">
          <span>{t('branch.field')}</span>
          <span>{t('ui.branch.comparisonMain')}</span>
          <span>{t('ui.branch.comparisonBranch')}</span>
          <span></span>
        </div>
        {changedDiffs.map(diff => (
          <div key={diff.field} className="grid grid-cols-[1fr_2fr_2fr_auto] gap-2 px-4 py-2.5 items-center">
            <span className="text-sm font-medium">{formatFieldName(diff.field)}</span>
            <span className="text-sm text-muted-foreground truncate" title={formatValue(diff.mainValue)}>
              {formatValue(diff.mainValue)}
            </span>
            <span className="text-sm text-info truncate" title={formatValue(diff.branchValue)}>
              {formatValue(diff.branchValue)}
            </span>
            <button
              onClick={() => onTransferField(comparison.sourceEntityId, diff.field, diff.branchValue)}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-success-soft text-success border border-success/20 rounded-md hover:opacity-80 whitespace-nowrap"
              title={t('branch.transferToMain')}
            >
              <ArrowRight className="h-3 w-3 rtl:rotate-180" />
              {t('branch.transfer')}
            </button>
          </div>
        ))}
      </div>
    </Card>
  )
}
