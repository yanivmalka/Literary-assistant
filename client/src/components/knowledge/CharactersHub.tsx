import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GitBranch, Plus, Search } from 'lucide-react'
import { useBranchStore } from '@/stores/branchStore'
import { useEntityStore } from '@/stores/entityStore'
import type { Entity } from '@/stores/entityStore'
import type { ExtractionModelProfile } from '@/lib/extractionModels'
import { shouldUseProfileBranch } from '@/lib/extractionModels'
import CharacterTile from './CharacterTile'
import CharacterDetailModal from './CharacterDetailModal'
import {
  getPopulatedCharacterFields,
  isDynamicCharacterProfile,
  loadCharacterFieldSchema,
  type CharacterFieldDefinition,
} from '@/lib/characterSchema'
import CharacterEditModal from './CharacterEditModal'

interface CharactersHubProps {
  projectId: string
  entities: Entity[]
  modelProfile: ExtractionModelProfile
}

type VersionType = 'main' | 'branch'

export default function CharactersHub({ projectId, modelProfile }: CharactersHubProps) {
  const { t } = useTranslation()

  const { currentBranch } = useBranchStore()
  const { createEntity, fetchEntities: fetchEntitiesStore, getMainOnlyEntities, getEffectiveBranchEntities } = useEntityStore()

  const [selectedVersion, setSelectedVersion] = useState<VersionType>(
    shouldUseProfileBranch(modelProfile) ? 'branch' : 'main',
  )
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [selectedCharacter, setSelectedCharacter] = useState<Entity | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [dynamicFields, setDynamicFields] = useState<CharacterFieldDefinition[]>([])
  const [dynamicSchemaLoading, setDynamicSchemaLoading] = useState(false)
  const createInProgressRef = useRef(false)

  useEffect(() => {
    setSelectedVersion(shouldUseProfileBranch(modelProfile) ? 'branch' : 'main')
  }, [modelProfile])

  useEffect(() => {
    setSearchTerm('')
    if (!isDynamicCharacterProfile(modelProfile)) {
      setDynamicFields([])
      return
    }
    setDynamicSchemaLoading(true)
    loadCharacterFieldSchema(projectId, modelProfile)
      .then(setDynamicFields)
      .catch(error => {
        console.error('Failed to load character field schema:', error)
        setDynamicFields([])
      })
      .finally(() => setDynamicSchemaLoading(false))
  }, [projectId, modelProfile])

  // Get characters for selected version (Main or Branch)
  const mainCharacters = getMainOnlyEntities({ type: 'character' })
  const branchCharacters = getEffectiveBranchEntities({ type: 'character' })
  const branchId = selectedVersion === 'branch' && currentBranch?.profile === modelProfile
    ? currentBranch.id
    : null
  const versionCharacters = selectedVersion === 'main' ? mainCharacters : branchCharacters
  const characters = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase()
    if (!query) return versionCharacters
    return versionCharacters.filter(character => {
      const populatedValues = getPopulatedCharacterFields(character, modelProfile, dynamicFields)
        .map(field => Array.isArray(field.value) ? field.value.join(' ') : String(field.value))
      const haystack = [character.name, ...(character.aliases || []), ...populatedValues]
        .join(' ')
        .toLocaleLowerCase()
      return haystack.includes(query)
    })
  }, [dynamicFields, modelProfile, searchTerm, versionCharacters])

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
    // React state updates are asynchronous, so use a ref to prevent
    // duplicate submissions from rapid clicks or repeated events.
    if (createInProgressRef.current) return

    createInProgressRef.current = true
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
      createInProgressRef.current = false
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
            className={`border-2 rounded-lg p-6 text-start transition-all ${
              selectedVersion === 'main'
                ? 'border-primary bg-primary/5'
                : 'border-muted hover:border-muted-foreground/50'
            }`}
          >
            <div className="font-semibold text-lg mb-2">{t('branch.main')}</div>
            <p className="text-sm text-muted-foreground mb-4">{t('branch.mainDescription')}</p>
            <div className="text-2xl font-bold text-primary">
              {mainCharacters.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{t('entities.types.character')}</p>
          </button>

          {/* Branch Version Tile */}
          {currentBranch ? (
            <button
              onClick={() => setSelectedVersion('branch')}
              className={`border-2 rounded-lg p-6 text-start transition-all ${
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
                {branchCharacters.length}
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
        <div className="flex items-center justify-between mb-4 gap-4">
          <h2 className="text-lg font-semibold">
            {selectedVersion === 'main' ? t('branch.main') : currentBranch?.name}
          </h2>
          <div className="flex items-center gap-3">
            <label className="relative block min-w-56">
              <span className="sr-only">{t('ui.character.searchPlaceholder')}</span>
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                placeholder={t('ui.character.searchPlaceholder')}
                className="w-full ps-9 pe-3 py-2 border rounded-md bg-background text-sm"
              />
            </label>
            <button
              onClick={handleCreateNew}
              disabled={isCreating || dynamicSchemaLoading}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Plus className="h-4 w-4" />
              {t('entities.newCharacter')}
            </button>
          </div>
        </div>

        {characters.length === 0 ? (
          <div className="border-2 border-dashed rounded-lg p-12 text-center">
            <p className="text-muted-foreground">
              {searchTerm.trim() ? t('ui.character.noSearchResults') : t('entities.emptyCharacters')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {characters.map(character => (
              <CharacterTile
                key={character.id}
                character={character}
                modelProfile={modelProfile}
                definitions={dynamicFields}
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
          projectId={projectId}
          modelProfile={modelProfile}
          definitions={dynamicFields}
          branchId={branchId}
          onClose={handleCloseDetailModal}
        />
      )}

      {/* Edit Modal */}
      {selectedCharacter && (
        <CharacterEditModal
          isOpen={editModalOpen}
          character={selectedCharacter}
          projectId={projectId}
          selectedVersion={selectedVersion}
          modelProfile={modelProfile}
          onClose={handleCloseEditModal}
          onCharacterUpdated={() => {
            handleCloseEditModal()
            fetchEntitiesStore(projectId, undefined, modelProfile)
          }}
        />
      )}
    </div>
  )
}
