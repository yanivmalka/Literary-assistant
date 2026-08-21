import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Shield, Sparkles } from 'lucide-react'
import type { Entity } from '@/stores/entityStore'
import { supabase } from '@/lib/supabase'

interface AbilitiesPanelProps {
  character: Entity
  onBack: () => void
}

type AbilityCategory = 'life_skills' | 'magic_skills'

interface Ability {
  id: string
  name: string
  description?: string
  type: 'ability' | 'magic_ability'
}

export default function AbilitiesPanel({ character, onBack }: AbilitiesPanelProps) {
  const { t } = useTranslation()
  const [selectedCategory, setSelectedCategory] = useState<AbilityCategory | null>(null)
  const [abilities, setAbilities] = useState<Ability[]>([])
  const [magicAbilities, setMagicAbilities] = useState<Ability[]>([])
  const [loading, setLoading] = useState(true)

  // Load abilities from database
  useEffect(() => {
    loadAbilities()
  }, [character.id])

  const loadAbilities = async () => {
    try {
      setLoading(true)
      
      // Query relationships for this character
      const { data: relationships, error: relError } = await supabase
        .from('knowledge_entity_relationships')
        .select('target_entity_id, relationship_type')
        .eq('source_entity_id', character.id)
        .eq('relationship_type', 'has_ability')

      if (relError) {
        console.error('Failed to fetch relationships:', relError)
        return
      }

      if (!relationships || relationships.length === 0) {
        setAbilities([])
        setMagicAbilities([])
        return
      }

      // Get the target ability entities
      const abilityIds = relationships.map(r => r.target_entity_id)
      const { data: abilityEntities, error: entError } = await supabase
        .from('knowledge_entities')
        .select('id, canonical_name, description, entity_type')
        .in('id', abilityIds)

      if (entError) {
        console.error('Failed to fetch ability entities:', entError)
        return
      }

      if (!abilityEntities) {
        setAbilities([])
        setMagicAbilities([])
        return
      }

      // Split by type
      const lifeSkills = abilityEntities
        .filter(e => e.entity_type === 'ability')
        .map(e => ({
          id: e.id,
          name: e.canonical_name,
          description: e.description || undefined,
          type: 'ability' as const,
        }))

      const magicSkills = abilityEntities
        .filter(e => e.entity_type === 'magic_ability')
        .map(e => ({
          id: e.id,
          name: e.canonical_name,
          description: e.description || undefined,
          type: 'magic_ability' as const,
        }))

      setAbilities(lifeSkills)
      setMagicAbilities(magicSkills)
    } catch (error) {
      console.error('Error loading abilities:', error)
    } finally {
      setLoading(false)
    }
  }

  if (selectedCategory) {
    const isLifeSkills = selectedCategory === 'life_skills'
    const abilityList = isLifeSkills ? abilities : magicAbilities
    const emptyStateKey = isLifeSkills
      ? 'entities.emptyStates.lifeSkills'
      : 'entities.emptyStates.magicSkills'

    return (
      <div className="max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setSelectedCategory(null)}
            className="p-1 rounded-md hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </button>
          <div>
            <h2 className="text-xl font-bold">{t(`${emptyStateKey}.label`)}</h2>
            <p className="text-sm text-muted-foreground mt-1">{character.name}</p>
          </div>
        </div>

        {/* Abilities List or Empty State */}
        {abilityList.length === 0 ? (
          <div className="border-2 border-dashed rounded-lg p-12 text-center">
            <p className="text-muted-foreground mb-2">
              {t(`${emptyStateKey}.title`)}
            </p>
            <p className="text-xs text-muted-foreground">
              {t(`${emptyStateKey}.description`)}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {abilityList.map(ability => (
              <div key={ability.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                <h3 className="font-semibold">{ability.name}</h3>
                {ability.description && (
                  <p className="text-sm text-muted-foreground mt-2">{ability.description}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Loading state
  if (loading) {
    return (
      <div className="max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onBack}
            className="p-1 rounded-md hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </button>
          <div>
            <h2 className="text-xl font-bold">{t('ui.abilities.title')}</h2>
            <p className="text-sm text-muted-foreground mt-1">{character.name}</p>
          </div>
        </div>
        <p className="text-muted-foreground text-center py-8">{t('ui.abilities.loading')}</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="p-1 rounded-md hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
        </button>
        <div>
          <h2 className="text-xl font-bold">{t('ui.abilities.title')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{character.name}</p>
        </div>
      </div>

      {/* Ability Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Life Skills Tile */}
        <button
          onClick={() => setSelectedCategory('life_skills')}
          className="border rounded-lg p-6 hover:shadow-md transition-all text-left"
        >
          <div className="flex items-center gap-3 mb-4">
            <Shield className="h-6 w-6 text-orange-500" />
            <h3 className="text-lg font-semibold">{t('entities.emptyStates.lifeSkills.label')}</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('entities.emptyStates.lifeSkills.categoryDescription')}
          </p>
        </button>

        {/* Magic Skills Tile */}
        <button
          onClick={() => setSelectedCategory('magic_skills')}
          className="border rounded-lg p-6 hover:shadow-md transition-all text-left"
        >
          <div className="flex items-center gap-3 mb-4">
            <Sparkles className="h-6 w-6 text-purple-500" />
            <h3 className="text-lg font-semibold">{t('entities.emptyStates.magicSkills.label')}</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('entities.emptyStates.magicSkills.categoryDescription')}
          </p>
        </button>
      </div>
    </div>
  )
}
