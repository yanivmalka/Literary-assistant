import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, ExternalLink } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import type { Entity } from '@/stores/entityStore'
import type { ExtractionModelProfile } from '@/lib/extractionModels'
import {
  getPopulatedCharacterFields,
  isDynamicCharacterProfile,
  isPopulatedCharacterField,
  loadCharacterFieldProvenance,
  normalizeCharacterGroupKey,
  type CharacterFieldDefinition,
  type CharacterFieldProvenance,
} from '@/lib/characterSchema'
import ObjectsPanel from './ObjectsPanel'
import AbilitiesPanel from './AbilitiesPanel'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

interface CharacterDetailModalProps {
  isOpen: boolean
  character: Entity
  projectId: string
  modelProfile: ExtractionModelProfile
  definitions?: CharacterFieldDefinition[]
  branchId: string | null
  onClose: () => void
}

type ViewType = 'detail' | 'objects' | 'abilities'

function getField(entity: Entity, field: string): string | null {
  const structured = entity.structured_fields as Record<string, unknown> | undefined
  if (structured && isPopulatedCharacterField(structured[field])) return String(structured[field])
  const attributes = entity.attributes as Record<string, unknown> | undefined
  if (attributes && isPopulatedCharacterField(attributes[field])) return String(attributes[field])
  return null
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object' && value !== null) return JSON.stringify(value)
  return String(value)
}

function dynamicGroupTranslationKey(groupKey: string): string {
  const keys: Record<string, string> = {
    'זהות': 'identityShort',
    'זהות ופרטים אישיים': 'identity',
    'תכונות': 'traits',
    'מראה חיצוני': 'appearance',
    'עולם הדמות': 'world',
    'ניתוח ותיאור': 'analysis',
    'שדות מותאמים אישית': 'custom',
  }
  return keys[groupKey] || groupKey
}

export default function CharacterDetailModal({
  isOpen,
  character,
  projectId,
  modelProfile,
  definitions = [],
  branchId,
  onClose,
}: CharacterDetailModalProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null)
  const [view, setView] = useState<ViewType>('detail')
  const [provenance, setProvenance] = useState<Record<string, CharacterFieldProvenance>>({})

  useEffect(() => setMountNode(document.body), [])

  useEffect(() => {
    if (!isOpen) return
    setView('detail')
    setProvenance({})
    loadCharacterFieldProvenance(character.id, branchId)
      .then(setProvenance)
      .catch(error => console.error('Failed to load character provenance:', error))
  }, [branchId, character.id, isOpen])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (view !== 'detail') setView('detail')
      else onClose()
    }
    if (!isOpen) return
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose, view])

  if (!isOpen || !mountNode) return null

  const handleBackdropClick = (event: React.MouseEvent) => {
    if (event.target !== event.currentTarget) return
    if (view !== 'detail') setView('detail')
    else onClose()
  }

  const isDynamicProfile = isDynamicCharacterProfile(modelProfile)
  const populatedFields = getPopulatedCharacterFields(character, modelProfile, definitions)
  const dynamicGroups = new Map<string, typeof populatedFields>()
  for (const field of populatedFields) {
    const groupKey = normalizeCharacterGroupKey(field.definition.group_key)
    const group = dynamicGroups.get(groupKey) || []
    group.push({ ...field, key: field.key.trim() })
    dynamicGroups.set(groupKey, group)
  }
  const legacyFields = [
    ['basicInfo', ['age', 'gender', 'height']],
    ['appearance', ['hair_color', 'eye_color']],
    ['description', ['description']],
  ] as const

  const renderProvenance = (fieldKey: string) => {
    const item = provenance[fieldKey]
    if (!item) return null
    return (
      <div className="mt-2 text-xs text-muted-foreground space-y-1">
        <div className="flex flex-wrap gap-x-2 gap-y-1">
          <span>{item.sourceType === 'user' ? t('ui.character.sourceUser') : t('ui.character.sourceAI')}</span>
          {item.inferred && <span>{t('ui.character.inferred')}</span>}
          {item.confidence !== null && <span>{t('ui.character.confidence', { value: Math.round(item.confidence * 100) })}</span>}
        </div>
        {item.inferenceNote && <p>{item.inferenceNote}</p>}
        {item.evidence.slice(0, 1).map((evidence, index) => (
          <blockquote key={index} className="border-s-2 ps-2 italic">“{evidence.quote}”{evidence.pageNumber !== null ? ` · ${t('qa.page')} ${evidence.pageNumber}` : ''}</blockquote>
        ))}
      </div>
    )
  }

  const renderDynamicField = ({ key, value, definition }: { key: string; value: unknown; definition: CharacterFieldDefinition }) => (
    <div key={key} className="p-3 bg-muted/50 rounded-md">
      <p className="text-xs text-muted-foreground font-medium mb-1">
        {t(`entityFields.dynamic.${key}`, { defaultValue: definition.label || key })}
      </p>
      <p className="font-medium whitespace-pre-wrap">{formatValue(value)}</p>
      {renderProvenance(key)}
    </div>
  )

  const handleClose = () => {
    setView('detail')
    onClose()
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-stretch sm:items-center justify-center z-50 p-0 sm:p-4" onClick={handleBackdropClick}>
      <div className="bg-card border border-border rounded-none sm:rounded-lg shadow-lg sm:max-w-3xl w-full h-full sm:h-auto max-h-full sm:max-h-[90vh] overflow-auto flex flex-col">
        <div className="sticky top-0 bg-card border-b border-border p-4 sm:p-6 flex items-start justify-between gap-3 z-10">
          <div className="min-w-0">
            <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight break-words">{character.name}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t('entities.typesSingular.character')}</p>
          </div>
          <button onClick={handleClose} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-accent transition-colors" aria-label={t('common.close')}>
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 p-4 sm:p-6">
          {view === 'detail' && (
            <div className="space-y-6">
              {isDynamicProfile ? (
                [...dynamicGroups.entries()].map(([groupKey, fields]) => (
                  <section key={groupKey}>
                    <h3 className="font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide">
                      {t(`entityFields.dynamic.groups.${dynamicGroupTranslationKey(groupKey)}`, { defaultValue: groupKey })}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{fields.map(renderDynamicField)}</div>
                  </section>
                ))
              ) : (
                legacyFields.map(([groupKey, keys]) => {
                  const fields = keys.map(key => ({ key, value: getField(character, key) })).filter(field => field.value)
                  if (fields.length === 0) return null
                  return (
                    <section key={groupKey}>
                      <h3 className="font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide">{t(`entityFields.${groupKey}`)}</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {fields.map(field => <div key={field.key} className="p-3 bg-muted/50 rounded-md"><p className="text-xs text-muted-foreground font-medium mb-1">{t(`entityFields.${field.key}`)}</p><p className="font-medium">{field.value}</p></div>)}
                      </div>
                    </section>
                  )
                })
              )}

              {character.aliases?.length > 0 && (
                <section>
                  <h3 className="font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide">{t('entityFields.aliases')}</h3>
                  <div className="flex flex-wrap gap-2">{Array.from(new Set(character.aliases)).map(alias => <span key={alias} className="px-3 py-1 bg-muted text-sm rounded-full text-muted-foreground">{alias}</span>)}</div>
                </section>
              )}

              <div className="pt-4 border-t border-border flex flex-wrap gap-3">
                <Button
                  variant="secondary"
                  onClick={() => navigate(`/projects/${projectId}/entities/${character.id}?profile=${modelProfile}${branchId ? `&branch=${branchId}` : ''}`)}
                >
                  <ExternalLink className="h-4 w-4" />
                  {t('ui.character.openProfile')}
                </Button>
                <button onClick={() => setView('objects')} className="flex-1 min-w-32 text-center">
                  <Card className="p-4 hover:bg-accent transition-colors">
                    <div className="font-display font-semibold mb-1">{t('entities.types.object')}</div>
                    <p className="text-xs text-muted-foreground">{t('ui.common.viewDetails')}</p>
                  </Card>
                </button>
                <button onClick={() => setView('abilities')} className="flex-1 min-w-32 text-center">
                  <Card className="p-4 hover:bg-accent transition-colors">
                    <div className="font-display font-semibold mb-1">{t('ui.abilities.title')}</div>
                    <p className="text-xs text-muted-foreground">{t('ui.common.viewDetails')}</p>
                  </Card>
                </button>
              </div>
            </div>
          )}
          {view === 'objects' && (
            <ObjectsPanel
              character={character}
              projectId={projectId}
              modelProfile={modelProfile}
              branchId={branchId}
              onBack={() => setView('detail')}
            />
          )}
          {view === 'abilities' && <AbilitiesPanel character={character} projectId={projectId} modelProfile={modelProfile} branchId={branchId} onBack={() => setView('detail')} />}
        </div>
      </div>
    </div>,
    mountNode,
  )
}
