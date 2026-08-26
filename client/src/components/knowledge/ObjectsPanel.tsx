import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import { shouldUseProfileBranch } from '@/lib/extractionModels'
import type { Entity } from '@/stores/entityStore'
import type { ExtractionModelProfile } from '@/lib/extractionModels'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/Card'

interface ObjectsPanelProps {
  character: Entity
  projectId: string
  modelProfile: ExtractionModelProfile
  branchId: string | null
  onBack: () => void
}

interface OwnedObject {
  id: string
  name: string
  description?: string
}

export default function ObjectsPanel({ character, projectId, modelProfile, branchId, onBack }: ObjectsPanelProps) {
  const { t } = useTranslation()
  const [objects, setObjects] = useState<OwnedObject[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadObjects()
  }, [character.id, projectId, modelProfile, branchId])

  const loadObjects = async () => {
    try {
      setLoading(true)

      const relationshipQuery = supabase
        .from('knowledge_entity_relationships')
        .select('target_entity_id, relationship_type')
        .eq('source_entity_id', character.id)
        .eq('relationship_type', 'owns')
      const { data: relationships, error: relError } = shouldUseProfileBranch(modelProfile) && branchId
        ? await relationshipQuery.eq('branch_id', branchId)
        : await relationshipQuery

      if (relError) {
        console.error('Failed to fetch relationships:', relError)
        setObjects([])
        return
      }

      if (!relationships || relationships.length === 0) {
        setObjects([])
        return
      }

      const objectIds = relationships.map(r => r.target_entity_id)
      const { data: objectEntities, error: entError } = await supabase
        .from('knowledge_entities')
        .select('id, canonical_name, description, entity_type')
        .in('id', objectIds)
        .eq('entity_type', 'object')

      if (entError) {
        console.error('Failed to fetch object entities:', entError)
        setObjects([])
        return
      }

      setObjects(
        (objectEntities || []).map(e => ({
          id: e.id,
          name: e.canonical_name,
          description: e.description || undefined,
        })),
      )
    } catch (error) {
      console.error('Error loading objects:', error)
      setObjects([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="p-1 rounded-md hover:bg-accent transition-colors"
        >
          <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
        </button>
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight">{t('entities.types.object')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{character.name}</p>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-center py-8">{t('ui.abilities.loading')}</p>
      ) : objects.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
          <p className="text-muted-foreground mb-2">
            {t('entities.emptyStates.object.title')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('entities.emptyStates.object.description')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {objects.map(object => (
            <Card key={object.id} className="p-4 hover:bg-accent/50 transition-colors">
              <h3 className="font-display font-semibold">{object.name}</h3>
              {object.description && (
                <p className="text-sm text-muted-foreground mt-2">{object.description}</p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
