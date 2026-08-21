import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { createPortal } from 'react-dom'
import type { Entity } from '@/stores/entityStore'
import ObjectsPanel from './ObjectsPanel'
import AbilitiesPanel from './AbilitiesPanel'

interface CharacterDetailModalProps {
  isOpen: boolean
  character: Entity
  projectId: string
  onClose: () => void
}

type ViewType = 'detail' | 'objects' | 'abilities'

function getField(entity: Entity, field: string): string | null {
  const sf = entity.structured_fields as Record<string, unknown> | undefined
  if (sf && sf[field] != null && sf[field] !== '') return String(sf[field])
  const attr = entity.attributes as Record<string, unknown> | undefined
  if (attr && attr[field] != null && attr[field] !== '') return String(attr[field])
  return null
}

export default function CharacterDetailModal({
  isOpen,
  character,
  projectId,
  onClose,
}: CharacterDetailModalProps) {
  const { t } = useTranslation()
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null)
  const [view, setView] = useState<ViewType>('detail')

  useEffect(() => {
    setMountNode(document.body)
  }, [])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (view !== 'detail') {
          setView('detail')
        } else {
          onClose()
        }
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose, view])

  useEffect(() => {
    if (isOpen) {
      setView('detail')
    }
  }, [isOpen])

  if (!isOpen || !mountNode) return null

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      if (view !== 'detail') {
        setView('detail')
      } else {
        onClose()
      }
    }
  }

  const name = character.name
  const age = getField(character, 'age')
  const gender = getField(character, 'gender')
  const height = getField(character, 'height')
  const hairColor = getField(character, 'hair_color')
  const eyeColor = getField(character, 'eye_color')
  const description = getField(character, 'description')

  const handleClose = () => {
    setView('detail')
    onClose()
  }

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-background rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="sticky top-0 bg-background border-b p-6 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold">{name}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t('entities.typesSingular.character')}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-md hover:bg-muted transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {view === 'detail' && (
            <div className="space-y-6">
              {/* Primary Attributes */}
              {(age || gender || height) && (
                <div>
                  <h3 className="font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide">
                    {t('entityFields.basicInfo')}
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {age && (
                      <div className="p-3 bg-muted/50 rounded">
                        <p className="text-xs text-muted-foreground font-medium mb-1">
                          {t('entityFields.age')}
                        </p>
                        <p className="font-medium">{age}</p>
                      </div>
                    )}
                    {gender && (
                      <div className="p-3 bg-muted/50 rounded">
                        <p className="text-xs text-muted-foreground font-medium mb-1">
                          {t('entityFields.gender')}
                        </p>
                        <p className="font-medium">{gender}</p>
                      </div>
                    )}
                    {height && (
                      <div className="p-3 bg-muted/50 rounded">
                        <p className="text-xs text-muted-foreground font-medium mb-1">
                          {t('entityFields.height')}
                        </p>
                        <p className="font-medium">{height}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Appearance */}
              {(hairColor || eyeColor) && (
                <div>
                  <h3 className="font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide">
                    {t('entityFields.appearance')}
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {hairColor && (
                      <div className="p-3 bg-muted/50 rounded">
                        <p className="text-xs text-muted-foreground font-medium mb-1">
                          {t('entityFields.hair_color')}
                        </p>
                        <p className="font-medium">{hairColor}</p>
                      </div>
                    )}
                    {eyeColor && (
                      <div className="p-3 bg-muted/50 rounded">
                        <p className="text-xs text-muted-foreground font-medium mb-1">
                          {t('entityFields.eye_color')}
                        </p>
                        <p className="font-medium">{eyeColor}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Description */}
              {description && (
                <div>
                  <h3 className="font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide">
                    {t('entityFields.description')}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground bg-muted/50 p-3 rounded">
                    {description}
                  </p>
                </div>
              )}

              {/* Aliases */}
              {character.aliases && character.aliases.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide">
                    {t('entityFields.aliases')}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {character.aliases.map((alias, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 bg-muted text-sm rounded-full text-muted-foreground"
                      >
                        {alias}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Tiles */}
              <div className="pt-4 border-t grid grid-cols-2 gap-4">
                <button
                  onClick={() => setView('objects')}
                  className="p-4 border rounded-lg hover:bg-muted transition-colors text-center"
                >
                  <div className="font-semibold mb-1">{t('entities.types.object')}</div>
                  <p className="text-xs text-muted-foreground">{t('ui.common.viewDetails')}</p>
                </button>
                <button
                  onClick={() => setView('abilities')}
                  className="p-4 border rounded-lg hover:bg-muted transition-colors text-center"
                >
                  <div className="font-semibold mb-1">{t('ui.abilities.title')}</div>
                  <p className="text-xs text-muted-foreground">{t('ui.common.viewDetails')}</p>
                </button>
              </div>
            </div>
          )}

          {view === 'objects' && (
            <ObjectsPanel character={character} onBack={() => setView('detail')} />
          )}

          {view === 'abilities' && (
            <AbilitiesPanel
              character={character}
              projectId={projectId}
              onBack={() => setView('detail')}
            />
          )}
        </div>
      </div>
    </div>,
    mountNode
  )
}
