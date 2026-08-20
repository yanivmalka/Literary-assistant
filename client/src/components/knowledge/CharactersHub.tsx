import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GitBranch, Plus } from 'lucide-react'
import { useBranchStore } from '@/stores/branchStore'
import { useEntityStore } from '@/stores/entityStore'
import type { Entity } from '@/stores/entityStore'
import CharacterTile from './CharacterTile'
import CharacterDetailModal from './CharacterDetailModal'
import CharacterEditModal from './CharacterEditModal'

interface CharactersHubProps {
  projectId: string
  entities: Entity[]
}

type VersionType = 'main' | 'branch'

export default function CharactersHub({ projectId, entities }: CharactersHubProps) {
  const { t } = useTranslation()

  const { currentBranch } = useBranchStore()
  const { createEntity, fetchEntities: fetchEntitiesStore } = useEntityStore()

  const [selectedVersion, setSelectedVersion] = useState<VersionType>('main')
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [selectedCharacter, setSelectedCharacter] = useState<Entity | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  // Get characters for current version
  const characters = entities.filter(
    e => e.entity_type === 'character'
  )

  const handleCharacterClick = (character: Entity) => {
    setSelectedCharacter(character)
    setDetailModalOpen(true)
  }

  const handleEditClick = (e: React.MouseEvent, character: Entity) => {
    e.stopPropagation()
    setSelectedCharacter(character)
    setEditModalOpen(true)
  }

  const handleCreateNew = async () => {
    setIsCreating(true)
    try {
      const newEntity = await createEntity(
        projectId,
        'character',
        { name: t('entities.newCharacter') },
        selectedVersion === 'branch' && currentBranch
          ? { branchId: currentBranch.id, layer: 'branch' }
          : undefined
      )
      if (newEntity) {
        setSelectedCharacter(newEntity)
        setEditModalOpen(true)
      }
    } catch (error) {
      console.error('Failed to create character:', error)
    } finally {
      setIsCreating(false)
    }
  }

  const handleCloseDetailModal = () => {
    setDetailModalOpen(false)
    setSelectedCharacter(null)
  }

  const handleCloseEditModal = () => {
    setEditModalOpen(false)
    setSelectedCharacter(null)
  }

  return (
    <div>
      {/* Version Selection */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4">{t('branch.version')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Main Version Tile */}
          <button
            onClick={() => setSelectedVersion('main')}
            className={`border-2 rounded-lg p-6 text-left transition-all ${
              selectedVersion === 'main'
                ? 'border-primary bg-primary/5'
                : 'border-muted hover:border-muted-foreground/50'
            }`}
          >
            <div className="font-semibold text-lg mb-2">{t('branch.main')}</div>
            <p className="text-sm text-muted-foreground mb-4">{t('branch.mainDescription')}</p>
            <div className="text-2xl font-bold text-primary">
              {characters.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{t('entities.types.character')}</p>
          </button>

          {/* Branch Version Tile */}
          {currentBranch ? (
            <button
              onClick={() => setSelectedVersion('branch')}
              className={`border-2 rounded-lg p-6 text-left transition-all ${
                selectedVersion === 'branch'
                  ? 'border-primary bg-primary/5'
                  : 'border-muted hover:border-muted-foreground/50'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <GitBranch className="h-4 w-4" />
                <div className="font-semibold text-lg">{currentBranch.name}</div>
              </div>
              <p className="text-sm text-muted-foreground mb-4">{t('branch.branchDescription')}</p>
              <div className="text-2xl font-bold text-primary">
                {characters.length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{t('entities.types.character')}</p>
            </button>
          ) : (
            <div className="border-2 border-dashed rounded-lg p-6 opacity-50 cursor-not-allowed">
              <div className="flex items-center gap-2 mb-2">
                <GitBranch className="h-4 w-4" />
                <div className="font-semibold text-lg">{t('branch.noBranch')}</div>
              </div>
              <p className="text-sm text-muted-foreground">{t('branch.createBranchFirst')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Character Tiles */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {selectedVersion === 'main' ? t('branch.main') : currentBranch?.name}
          </h2>
          <button
            onClick={handleCreateNew}
            disabled={isCreating}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t('entities.newCharacter')}
          </button>
        </div>

        {characters.length === 0 ? (
          <div className="border-2 border-dashed rounded-lg p-12 text-center">
            <p className="text-muted-foreground">{t('entities.empty')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {characters.map(character => (
              <CharacterTile
                key={character.id}
                character={character}
                onClick={() => handleCharacterClick(character)}
                onEditClick={(e) => handleEditClick(e, character)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedCharacter && (
        <CharacterDetailModal
          isOpen={detailModalOpen}
          character={selectedCharacter}
          onClose={handleCloseDetailModal}
        />
      )}

      {/* Edit Modal */}
      {selectedCharacter && (
        <CharacterEditModal
          isOpen={editModalOpen}
          character={selectedCharacter}
          projectId={projectId}
          onClose={handleCloseEditModal}
          onCharacterUpdated={() => {
            handleCloseEditModal()
            fetchEntitiesStore(projectId)
          }}
        />
      )}
    </div>
  )
}
