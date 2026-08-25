import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Shield, Sparkles } from 'lucide-react'
import { shouldUseAbilityFallback } from '@/lib/abilityProfile'
import { shouldUseProfileBranch } from '@/lib/extractionModels'
import type { Entity } from '@/stores/entityStore'
import type { ExtractionModelProfile } from '@/lib/extractionModels'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/Card'

interface AbilitiesPanelProps {
  character: Entity
  projectId: string
  modelProfile: ExtractionModelProfile
  branchId: string | null
  onBack: () => void
}

type AbilityCategory = 'life_skills' | 'magic_skills'

interface Ability {
  id: string
  name: string
  description?: string
  type: 'ability' | 'magic_ability'
}

function readAbilityName(value: unknown): { name: string; description?: string } | null {
  if (typeof value === 'string' && value.trim()) return { name: value.trim() }
  if (!value || typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  const name = ['name', 'ability', 'skill', 'title', 'canonical_name']
    .map(key => record[key])
    .find((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)
  if (!name) return null

  return {
    name: name.trim(),
    description: typeof record.description === 'string' ? record.description : undefined,
  }
}

function getEmbeddedAbilities(character: Entity): Ability[] {
  const attributes = {
    ...(character.structured_fields || {}),
    ...(character.attributes || {}),
  } as Record<string, unknown>
  const result: Ability[] = []
  const seen = new Set<string>()

  const collect = (
    keys: string[],
    type: Ability['type'],
  ) => {
    for (const key of keys) {
      const raw = attributes[key]
      const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw]
      for (const value of values) {
        const parsed = readAbilityName(value)
        if (!parsed) continue
        const identity = `${type}:${parsed.name.trim().toLocaleLowerCase()}`
        if (seen.has(identity)) continue
        seen.add(identity)
        result.push({
          id: `embedded-${type}-${result.length}`,
          name: parsed.name,
          description: parsed.description,
          type,
        })
      }
    }
  }

  collect(['abilities', 'life_skills', 'skills', 'physical_abilities', 'physicalAbilities'], 'ability')
  collect(['magic_abilities', 'magic_skills', 'magicAbilities'], 'magic_ability')
  return result
}

function abilityUsersMatchCharacter(entity: {
  attributes?: Record<string, unknown> | null
}, character: Entity): boolean {
  const users = entity.attributes?.users
  const userNames = Array.isArray(users)
    ? users.filter((value): value is string => typeof value === 'string')
    : typeof users === 'string'
      ? users.split(',').map(value => value.trim()).filter(Boolean)
      : []
  const characterNames = [character.name, ...(character.aliases || [])]
    .map(value => value.trim().toLocaleLowerCase())
    .filter(Boolean)
  return userNames.some(user => characterNames.includes(user.trim().toLocaleLowerCase()))
}

export default function AbilitiesPanel({
  character,
  projectId,
  modelProfile,
  branchId,
  onBack,
}: AbilitiesPanelProps) {
  const { t } = useTranslation()
  const [selectedCategory, setSelectedCategory] = useState<AbilityCategory | null>(null)
  const [abilities, setAbilities] = useState<Ability[]>([])
  const [magicAbilities, setMagicAbilities] = useState<Ability[]>([])
  const [loading, setLoading] = useState(true)

  // Load abilities from database
  useEffect(() => {
    loadAbilities()
  }, [character.id, projectId, modelProfile, branchId])

  const allowDevelopmentFallback = shouldUseAbilityFallback(modelProfile)

  const loadAbilities = async () => {
    try {
      setLoading(true)
      const embeddedAbilities = getEmbeddedAbilities(character)
      const setEmbeddedState = () => {
        setAbilities(embeddedAbilities.filter(ability => ability.type === 'ability'))
        setMagicAbilities(embeddedAbilities.filter(ability => ability.type === 'magic_ability'))
      }
      const setFallbackState = () => {
        if (allowDevelopmentFallback) {
          setEmbeddedState()
        } else {
          setAbilities([])
          setMagicAbilities([])
        }
      }
      const applyAbilityEntities = (entities: Array<{
        id: string
        canonical_name: string
        description?: string | null
        entity_type: string
        attributes?: Record<string, unknown> | null
      }>) => {
        const lifeSkills = entities
          .filter(e => e.entity_type === 'ability')
          .map(e => ({
            id: e.id,
            name: e.canonical_name,
            description: e.description || undefined,
            type: 'ability' as const,
          }))
        const magicSkills = entities
          .filter(e => e.entity_type === 'magic_ability')
          .map(e => ({
            id: e.id,
            name: e.canonical_name,
            description: e.description || undefined,
            type: 'magic_ability' as const,
          }))

        if (lifeSkills.length === 0 && magicSkills.length === 0) return false
        setAbilities(lifeSkills)
        setMagicAbilities(magicSkills)
        return true
      }
      const loadAbilityEntitiesByUser = async () => {
        if (!allowDevelopmentFallback || !branchId) return false

        const { data, error } = await supabase
          .from('knowledge_entities')
          .select('id, canonical_name, description, entity_type, attributes')
          .eq('project_id', projectId)
          .eq('layer', 'branch')
          .eq('branch_id', branchId)
          .in('entity_type', ['ability', 'magic_ability'])

        if (error) {
          console.error('Failed to fetch ability entities by user:', error)
          return false
        }

        const matchingEntities = (data || []).filter(entity =>
          abilityUsersMatchCharacter(entity, character),
        )
        return applyAbilityEntities(matchingEntities)
      }
      
      // Query relationships for this character. Relationships are canonical;
      // embedded attributes and ability.users are compatibility fallbacks for
      // extractions created before all links were persisted.
      const relationshipQuery = supabase
        .from('knowledge_entity_relationships')
        .select('target_entity_id, relationship_type')
        .eq('source_entity_id', character.id)
        .eq('relationship_type', 'has_ability')
      const { data: relationships, error: relError } = shouldUseProfileBranch(modelProfile) && branchId
        ? await relationshipQuery.eq('branch_id', branchId)
        : await relationshipQuery

      if (relError) {
        console.error('Failed to fetch relationships:', relError)
        if (!(await loadAbilityEntitiesByUser())) setFallbackState()
        return
      }

      if (relationships && relationships.length > 0) {
        const abilityIds = relationships.map(r => r.target_entity_id)
        const { data: abilityEntities, error: entError } = await supabase
          .from('knowledge_entities')
          .select('id, canonical_name, description, entity_type, attributes')
          .in('id', abilityIds)

        if (!entError && abilityEntities && applyAbilityEntities(abilityEntities)) return
        if (entError) console.error('Failed to fetch ability entities:', entError)
      }

      if (!(await loadAbilityEntitiesByUser())) setFallbackState()
    } catch (error) {
      console.error('Error loading abilities:', error)
      if (allowDevelopmentFallback) {
        setAbilities(getEmbeddedAbilities(character).filter(ability => ability.type === 'ability'))
        setMagicAbilities(getEmbeddedAbilities(character).filter(ability => ability.type === 'magic_ability'))
      } else {
        setAbilities([])
        setMagicAbilities([])
      }
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
            className="p-1 rounded-md hover:bg-accent transition-colors"
          >
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </button>
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">{t(`${emptyStateKey}.label`)}</h2>
            <p className="text-sm text-muted-foreground mt-1">{character.name}</p>
          </div>
        </div>

        {/* Abilities List or Empty State */}
        {abilityList.length === 0 ? (
          <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
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
              <Card key={ability.id} className="p-4 hover:bg-accent/50 transition-colors">
                <h3 className="font-display font-semibold">{ability.name}</h3>
                {ability.description && (
                  <p className="text-sm text-muted-foreground mt-2">{ability.description}</p>
                )}
              </Card>
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
            className="p-1 rounded-md hover:bg-accent transition-colors"
          >
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </button>
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">{t('ui.abilities.title')}</h2>
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
          className="p-1 rounded-md hover:bg-accent transition-colors"
        >
          <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
        </button>
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight">{t('ui.abilities.title')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{character.name}</p>
        </div>
      </div>

      {/* Ability Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Life Skills Tile */}
        <button
          onClick={() => setSelectedCategory('life_skills')}
          className="text-start"
        >
          <Card className="p-6 hover:shadow-md transition-all">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="h-6 w-6 text-warning" />
              <h3 className="font-display text-lg font-semibold">{t('entities.emptyStates.lifeSkills.label')}</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('entities.emptyStates.lifeSkills.categoryDescription')}
            </p>
          </Card>
        </button>

        {/* Magic Skills Tile */}
        <button
          onClick={() => setSelectedCategory('magic_skills')}
          className="text-start"
        >
          <Card className="p-6 hover:shadow-md transition-all">
            <div className="flex items-center gap-3 mb-4">
              <Sparkles className="h-6 w-6 text-primary" />
              <h3 className="font-display text-lg font-semibold">{t('entities.emptyStates.magicSkills.label')}</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('entities.emptyStates.magicSkills.categoryDescription')}
            </p>
          </Card>
        </button>
      </div>
    </div>
  )
}
