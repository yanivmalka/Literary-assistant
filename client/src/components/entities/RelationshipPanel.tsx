import { useState } from 'react'
import { Plus, Trash2, Check, X } from 'lucide-react'

interface Relationship {
  id: string
  source_entity_id: string
  target_entity_id: string
  relationship_type: string
  review_status: 'pending' | 'approved' | 'rejected'
  base_exists: boolean
}

interface Entity {
  id: string
  name: string
  entity_type: string
}

interface RelationshipPanelProps {
  entity: Entity
  relationships: Relationship[]
  allEntities: Entity[]
  branchId?: string
  isEditMode: boolean
  onAddRelationship: (targetId: string, type: string) => Promise<void>
  onReviewRelationship: (relId: string, approved: boolean) => Promise<void>
  onRemoveRelationship: (relId: string) => Promise<void>
}

const RELATIONSHIP_TYPES = ['owns', 'uses', 'located_in', 'knows', 'parent_of', 'involves', 'occurs_at', 'contained_in'] as const

export default function RelationshipPanel({
  entity,
  relationships,
  allEntities,
  branchId,
  isEditMode,
  onAddRelationship,
  onReviewRelationship,
  onRemoveRelationship,
}: RelationshipPanelProps) {
  const [loading, setLoading] = useState(false)
  const [selectedType, setSelectedType] = useState<typeof RELATIONSHIP_TYPES[number]>('knows')
  const [selectedTarget, setSelectedTarget] = useState<string>('')

  // Filter out self-relationships and find available targets
  const availableTargets = allEntities.filter(e => e.id !== entity.id)

  // Group relationships by type
  const relationshipsByType = relationships.reduce((acc, rel) => {
    if (!acc[rel.relationship_type]) {
      acc[rel.relationship_type] = []
    }
    acc[rel.relationship_type].push(rel)
    return acc
  }, {} as Record<string, Relationship[]>)

  const handleAddRelationship = async () => {
    if (!selectedTarget) return
    setLoading(true)
    try {
      await onAddRelationship(selectedTarget, selectedType)
      setSelectedTarget('')
    } finally {
      setLoading(false)
    }
  }

  const getEntityName = (entityId: string) => {
    return allEntities.find(e => e.id === entityId)?.name || 'Unknown'
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">Relationships</h3>

      {/* Existing relationships */}
      <div className="space-y-3">
        {Object.entries(relationshipsByType).length === 0 ? (
          <p className="text-sm text-gray-500">No relationships yet.</p>
        ) : (
          Object.entries(relationshipsByType).map(([type, rels]) => (
            <div key={type} className="border rounded-lg p-3 space-y-2">
              <h4 className="font-medium text-sm capitalize">{type}</h4>
              {rels.map(rel => {
                const targetName = getEntityName(rel.target_entity_id)
                const isPending = rel.review_status === 'pending'

                return (
                  <div
                    key={rel.id}
                    className={`flex items-center justify-between p-2 rounded text-sm ${
                      isPending
                        ? 'bg-yellow-50 border border-yellow-200'
                        : rel.review_status === 'approved'
                          ? 'bg-green-50 border border-green-200'
                          : 'bg-red-50 border border-red-200'
                    }`}
                  >
                    <span className="flex-1">{targetName}</span>
                    {branchId && isPending && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => onReviewRelationship(rel.id, true)}
                          className="p-1 hover:bg-green-200 rounded"
                          title="Approve"
                        >
                          <Check className="w-4 h-4 text-green-600" />
                        </button>
                        <button
                          onClick={() => onReviewRelationship(rel.id, false)}
                          className="p-1 hover:bg-red-200 rounded"
                          title="Reject"
                        >
                          <X className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    )}
                    {isEditMode && !rel.base_exists && (
                      <button
                        onClick={() => onRemoveRelationship(rel.id)}
                        className="p-1 hover:bg-red-200 rounded"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>

      {/* Add new relationship (edit mode only) */}
      {isEditMode && (
        <div className="border-t pt-4 space-y-3">
          <h4 className="font-medium text-sm">Add Relationship</h4>
          <div className="space-y-2">
            <select
              id="relationship-type"
              name="relationship-type"
              autoComplete="off"
              value={selectedType}
              onChange={e => setSelectedType(e.target.value as typeof RELATIONSHIP_TYPES[number])}
              className="w-full px-3 py-2 border rounded-md text-sm"
            >
              {RELATIONSHIP_TYPES.map(type => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>

            <select
              id="relationship-target"
              name="relationship-target"
              autoComplete="off"
              value={selectedTarget}
              onChange={e => setSelectedTarget(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
            >
              <option value="">Select target entity...</option>
              {availableTargets.map(target => (
                <option key={target.id} value={target.id}>
                  {target.name} ({target.entity_type})
                </option>
              ))}
            </select>

            <button
              onClick={handleAddRelationship}
              disabled={!selectedTarget || loading}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
