import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Shield, Sparkles } from 'lucide-react'
import type { Entity } from '@/stores/entityStore'

interface AbilitiesPanelProps {
  character: Entity
  onBack: () => void
}

type AbilityCategory = 'life_skills' | 'magic_skills'

export default function AbilitiesPanel({ character, onBack }: AbilitiesPanelProps) {
  const { t } = useTranslation()
  const [selectedCategory, setSelectedCategory] = useState<AbilityCategory | null>(null)

  if (selectedCategory) {
    const isLifeSkills = selectedCategory === 'life_skills'
    const title = isLifeSkills ? 'Life Skills' : 'Magic Skills'
    const icon = isLifeSkills ? Shield : Sparkles

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
            <h2 className="text-xl font-bold">{title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{character.name}</p>
          </div>
        </div>

        {/* Empty State */}
        <div className="border-2 border-dashed rounded-lg p-12 text-center">
          <p className="text-muted-foreground mb-2">
            {t('entities.empty')}
          </p>
          <p className="text-xs text-muted-foreground">
            {isLifeSkills
              ? 'Life skills for this character will appear here.'
              : 'Magic skills for this character will appear here.'}
          </p>
        </div>
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
          <h2 className="text-xl font-bold">Abilities</h2>
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
            <h3 className="text-lg font-semibold">Life Skills</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Physical abilities, combat skills, and practical life skills
          </p>
        </button>

        {/* Magic Skills Tile */}
        <button
          onClick={() => setSelectedCategory('magic_skills')}
          className="border rounded-lg p-6 hover:shadow-md transition-all text-left"
        >
          <div className="flex items-center gap-3 mb-4">
            <Sparkles className="h-6 w-6 text-purple-500" />
            <h3 className="text-lg font-semibold">Magic Skills</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Magic abilities, spells, and magical powers
          </p>
        </button>
      </div>
    </div>
  )
}
