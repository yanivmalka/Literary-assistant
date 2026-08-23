import { supabase } from '@/lib/supabase'
import type { ExtractionModelProfile } from '@/lib/extractionModels'
import type { Entity } from '@/stores/entityStore'

export const DYNAMIC_CHARACTER_PROFILE = 'sub-base-c-characters' as const
export const LEGACY_DYNAMIC_CHARACTER_PROFILE = 'sub-base-locations' as const
export const DYNAMIC_CHARACTER_PROFILES = [
  LEGACY_DYNAMIC_CHARACTER_PROFILE,
  DYNAMIC_CHARACTER_PROFILE,
] as const

export type CharacterDynamicProfile = typeof DYNAMIC_CHARACTER_PROFILES[number]
export type CharacterFieldType = 'text' | 'long_text' | 'number' | 'boolean' | 'select' | 'multi_select'

export interface CharacterFieldDefinition {
  id?: string
  project_id?: string
  model_profile: CharacterDynamicProfile
  field_key: string
  label: string
  field_type: CharacterFieldType
  group_key: string
  options: string[]
  is_active: boolean
  sort_order: number
}

const characterField = (
  field_key: string,
  label: string,
  field_type: CharacterFieldType,
  group_key: string,
  sort_order: number,
): CharacterFieldDefinition => ({
  model_profile: DYNAMIC_CHARACTER_PROFILE,
  field_key,
  label,
  field_type,
  group_key,
  options: [],
  is_active: true,
  sort_order,
})

/**
 * The fixed C catalog. Project-selected definitions are merged with this
 * catalog at runtime, so extracted fields remain visible even before a user
 * explicitly adds them to the project schema.
 */
export const CHARACTER_FIELD_CATALOG: readonly CharacterFieldDefinition[] = [
  characterField('first_name', 'שם פרטי', 'text', 'זהות ופרטים אישיים', 5),
  characterField('last_name', 'שם משפחה', 'text', 'זהות ופרטים אישיים', 10),
  characterField('aliases', 'כינויים', 'multi_select', 'זהות ופרטים אישיים', 20),
  characterField('age', 'גיל', 'text', 'זהות ופרטים אישיים', 30),
  characterField('gender', 'מגדר', 'text', 'זהות ופרטים אישיים', 40),
  characterField('sexual_orientation', 'נטייה מינית', 'text', 'זהות ופרטים אישיים', 50),
  characterField('pronouns', 'כינויי גוף', 'text', 'זהות ופרטים אישיים', 55),
  characterField('occupation', 'מקצוע', 'text', 'זהות ופרטים אישיים', 70),
  characterField('hobbies', 'תחביבים', 'long_text', 'זהות ופרטים אישיים', 80),
  characterField('favorite_foods', 'מאכלים אהובים', 'long_text', 'זהות ופרטים אישיים', 90),
  characterField('disliked_foods', 'מאכלים שנואים', 'long_text', 'זהות ופרטים אישיים', 95),
  characterField('religion', 'דת', 'text', 'זהות ופרטים אישיים', 100),
  characterField('beliefs', 'אמונות', 'long_text', 'זהות ופרטים אישיים', 105),
  characterField('race', 'גזע', 'text', 'עולם הדמות', 110),
  characterField('height', 'גובה', 'text', 'מראה חיצוני', 120),
  characterField('narrative_role', 'תפקיד בעלילה', 'long_text', 'ניתוח ותיאור', 130),
  characterField('status', 'מצב', 'text', 'ניתוח ותיאור', 140),
  characterField('personality_traits', 'תכונות אופי', 'long_text', 'תכונות', 150),
  characterField('strengths', 'חוזקות', 'long_text', 'תכונות', 160),
  characterField('weaknesses', 'חולשות', 'long_text', 'תכונות', 170),
  characterField('fears', 'פחדים', 'long_text', 'תכונות', 180),
  characterField('goals_and_desires', 'מטרות ורצונות', 'long_text', 'תכונות', 190),
  characterField('values_and_principles', 'ערכים ועקרונות', 'long_text', 'תכונות', 200),
  characterField('habits_and_mannerisms', 'הרגלים וגינונים', 'long_text', 'תכונות', 210),
  characterField('speech_style', 'סגנון דיבור', 'long_text', 'תכונות', 220),
  characterField('secrets', 'סודות', 'long_text', 'תכונות', 230),
  characterField('emotional_state', 'מצב רגשי', 'long_text', 'תכונות', 240),
  characterField('eye_color', 'צבע עיניים', 'text', 'מראה חיצוני', 250),
  characterField('eye_shape', 'צורת עיניים', 'text', 'מראה חיצוני', 260),
  characterField('eye_size', 'גודל עיניים', 'text', 'מראה חיצוני', 270),
  characterField('skin_color', 'צבע עור', 'text', 'מראה חיצוני', 280),
  characterField('hair_color', 'צבע שיער', 'text', 'מראה חיצוני', 290),
  characterField('hair_type', 'סוג שיער', 'text', 'מראה חיצוני', 300),
  characterField('tattoos', 'קעקועים', 'long_text', 'מראה חיצוני', 310),
  characterField('scars', 'צלקות', 'long_text', 'מראה חיצוני', 320),
  characterField('jewelry', 'תכשיטים', 'long_text', 'מראה חיצוני', 330),
  characterField('body_type', 'מבנה גוף', 'text', 'מראה חיצוני', 340),
  characterField('facial_features', 'תווי פנים', 'long_text', 'מראה חיצוני', 350),
  characterField('distinguishing_features', 'סממנים ייחודיים', 'long_text', 'מראה חיצוני', 360),
  characterField('typical_clothing', 'לבוש אופייני', 'long_text', 'מראה חיצוני', 370),
  characterField('posture_and_body_language', 'יציבה ושפת גוף', 'long_text', 'מראה חיצוני', 380),
  characterField('appearance_traits', 'תכונות מראה', 'long_text', 'מראה חיצוני', 390),
  characterField('description', 'תיאור כללי', 'long_text', 'ניתוח ותיאור', 400),
  characterField('narrative_impact', 'השפעה על העלילה', 'long_text', 'ניתוח ותיאור', 410),
  // Compatibility keys emitted by older character extractions.
  characterField('favorite_food', 'אוכל אהוב', 'text', 'זהות ופרטים אישיים', 92),
  characterField('dislikes', 'דברים שנואים', 'long_text', 'זהות ופרטים אישיים', 97),
  characterField('religion_and_beliefs', 'דת ואמונה', 'long_text', 'זהות ופרטים אישיים', 108),
]

export function normalizeCharacterGroupKey(groupKey: string): string {
  const normalized = groupKey.trim().replace(/\s+/g, ' ')
  const identityKeys = new Set([
    'זהות',
    'זהות ופרטים אישיים',
    'identity',
    'identity and personal details',
  ])
  return identityKeys.has(normalized.toLocaleLowerCase()) ? 'זהות' : normalized
}

export function isDynamicCharacterProfile(profile: ExtractionModelProfile | string): profile is CharacterDynamicProfile {
  return (DYNAMIC_CHARACTER_PROFILES as readonly string[]).includes(profile)
}

export function getCatalogCharacterField(fieldKey: string): CharacterFieldDefinition | undefined {
  return CHARACTER_FIELD_CATALOG.find(field => field.field_key === fieldKey)
}

export async function loadCharacterFieldSchema(
  projectId: string,
  profile: ExtractionModelProfile,
): Promise<CharacterFieldDefinition[]> {
  if (!isDynamicCharacterProfile(profile)) return []
  const { data, error } = await supabase
    .from('knowledge_character_field_definitions')
    .select('id, project_id, model_profile, field_key, label, field_type, group_key, options, is_active, sort_order')
    .eq('project_id', projectId)
    .eq('model_profile', profile)
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw error
  return (data || []) as CharacterFieldDefinition[]
}

export async function enableCharacterField(
  projectId: string,
  field: CharacterFieldDefinition,
): Promise<CharacterFieldDefinition> {
  if (!isDynamicCharacterProfile(field.model_profile)) {
    throw new Error('Dynamic character fields require a supported character profile')
  }
  const { data: authData } = await supabase.auth.getUser()
  if (!authData.user) throw new Error('Authentication required')
  const { data, error } = await supabase
    .from('knowledge_character_field_definitions')
    .upsert({
      project_id: projectId,
      model_profile: field.model_profile,
      field_key: field.field_key,
      label: field.label,
      field_type: field.field_type,
      group_key: field.group_key,
      options: field.options,
      sort_order: field.sort_order,
      is_active: true,
      created_by: authData.user.id,
    }, { onConflict: 'project_id,model_profile,field_key' })
    .select('id, project_id, model_profile, field_key, label, field_type, group_key, options, is_active, sort_order')
    .single()
  if (error || !data) throw error || new Error('Failed to enable character field')
  return data as CharacterFieldDefinition
}

function stableLabelHash(label: string): string {
  let hash = 2166136261
  for (const character of label.normalize('NFKC')) {
    hash ^= character.codePointAt(0) || 0
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36).slice(0, 10)
}

export function toCharacterFieldKey(label: string): string {
  const source = label.trim().toLowerCase()
  const readable = source
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  const prefix = readable && /^[a-z]/.test(readable) ? readable : `custom_${readable || 'value'}`
  return `${prefix.slice(0, 59)}_${stableLabelHash(source)}`.slice(0, 80)
}

export async function createCustomCharacterField(params: {
  projectId: string
  label: string
  fieldType?: 'text' | 'long_text'
  groupKey?: string
  modelProfile?: CharacterDynamicProfile
}): Promise<CharacterFieldDefinition> {
  const trimmedLabel = params.label.trim()
  if (trimmedLabel.length < 1 || trimmedLabel.length > 80) {
    throw new Error('Character field label must contain between 1 and 80 characters')
  }
  const modelProfile = params.modelProfile || DYNAMIC_CHARACTER_PROFILE
  const fieldKey = toCharacterFieldKey(trimmedLabel)
  if (getCatalogCharacterField(fieldKey)) {
    throw new Error('A catalog field with this key already exists')
  }
  const existing = await supabase
    .from('knowledge_character_field_definitions')
    .select('id, project_id, model_profile, field_key, label, field_type, group_key, options, is_active, sort_order')
    .eq('project_id', params.projectId)
    .eq('model_profile', modelProfile)
    .eq('field_key', fieldKey)
    .maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) return existing.data as CharacterFieldDefinition

  const { data: authData } = await supabase.auth.getUser()
  if (!authData.user) throw new Error('Authentication required')
  const { data, error } = await supabase
    .from('knowledge_character_field_definitions')
    .insert({
      project_id: params.projectId,
      model_profile: modelProfile,
      field_key: fieldKey,
      label: trimmedLabel,
      field_type: params.fieldType || 'text',
      group_key: params.groupKey || 'שדות מותאמים אישית',
      options: [],
      sort_order: 1000,
      created_by: authData.user.id,
    })
    .select('id, project_id, model_profile, field_key, label, field_type, group_key, options, is_active, sort_order')
    .single()
  if (error || !data) throw error || new Error('Failed to create character field')
  return data as CharacterFieldDefinition
}

export function isPopulatedCharacterField(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

export interface PopulatedCharacterField {
  key: string
  value: unknown
  definition: CharacterFieldDefinition
}

function getEntityFieldValue(entity: Entity, fieldKey: string): unknown {
  if (fieldKey === 'aliases' && entity.aliases?.length) return entity.aliases
  const structured = (entity.structured_fields || {}) as Record<string, unknown>
  if (structured[fieldKey] !== undefined && structured[fieldKey] !== null) return structured[fieldKey]
  const attributes = (entity.attributes || {}) as Record<string, unknown>
  return attributes[fieldKey]
}

export function getPopulatedCharacterFields(
  entity: Entity,
  profile: ExtractionModelProfile | string,
  definitions: CharacterFieldDefinition[] = [],
): PopulatedCharacterField[] {
  if (!isDynamicCharacterProfile(profile)) return []
  const definitionMap = new Map<string, CharacterFieldDefinition>()
  for (const field of CHARACTER_FIELD_CATALOG) definitionMap.set(field.field_key, field)
  for (const field of definitions) {
    if (field.is_active && field.model_profile === profile) definitionMap.set(field.field_key, field)
  }

  return [...definitionMap.values()]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(definition => ({ key: definition.field_key, value: getEntityFieldValue(entity, definition.field_key), definition }))
    .filter(item => isPopulatedCharacterField(item.value))
}

export interface CharacterAppearanceSummary {
  key: 'hair_summary' | 'eyes_summary'
  value: string
  sourceKeys: string[]
}

function displayValueParts(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(displayValueParts)
  if (value === null || value === undefined) return []
  if (typeof value === 'object') return [JSON.stringify(value)]
  const text = String(value).trim()
  return text ? [text] : []
}

/**
 * Builds display-only summaries while preserving the individual extracted
 * fields as the canonical values used by editing, persistence, and prompts.
 */
export function getCharacterAppearanceSummaries(
  entity: Entity,
  profile: ExtractionModelProfile | string,
  definitions: CharacterFieldDefinition[] = [],
): CharacterAppearanceSummary[] {
  const values = new Map(
    getPopulatedCharacterFields(entity, profile, definitions)
      .map(field => [field.key, field.value] as const),
  )
  const summary = (key: CharacterAppearanceSummary['key'], sourceKeys: string[]) => {
    const parts = sourceKeys.flatMap(sourceKey => displayValueParts(values.get(sourceKey)))
    return parts.length > 0 ? { key, value: [...new Set(parts)].join(' '), sourceKeys } : null
  }

  return [
    summary('hair_summary', ['hair_color', 'hair_type']),
    summary('eyes_summary', ['eye_shape', 'eye_color', 'eye_size']),
  ].filter((item): item is CharacterAppearanceSummary => item !== null)
}

export interface CharacterFieldProvenance {
  sourceType: 'ai' | 'user'
  confidence: number | null
  inferred: boolean
  inferenceNote: string | null
  evidence: Array<{ quote: string; pageNumber: number | null; positionStart: number | null; positionEnd: number | null }>
}

export async function loadCharacterFieldProvenance(
  entityId: string,
  branchId: string | null,
): Promise<Record<string, CharacterFieldProvenance>> {
  let valuesQuery = supabase
    .from('knowledge_entity_values')
    .select('id, field_path, source_type, confidence, metadata')
    .eq('entity_id', entityId)
    .eq('value_status', 'active')
  valuesQuery = branchId ? valuesQuery.eq('branch_id', branchId) : valuesQuery.is('branch_id', null)
  const { data: values, error } = await valuesQuery
  if (error || !values?.length) return {}

  const valueIds = values.map(value => value.id)
  const { data: evidence } = await supabase
    .from('knowledge_entity_value_evidence')
    .select('value_id, quote, page_number, position_start, position_end')
    .in('value_id', valueIds)

  const evidenceByValue = new Map<string, CharacterFieldProvenance['evidence']>()
  for (const row of evidence || []) {
    const list = evidenceByValue.get(row.value_id) || []
    list.push({
      quote: row.quote,
      pageNumber: row.page_number ?? null,
      positionStart: row.position_start ?? null,
      positionEnd: row.position_end ?? null,
    })
    evidenceByValue.set(row.value_id, list)
  }

  return Object.fromEntries(values.map(value => {
    const metadata = (value.metadata || {}) as Record<string, unknown>
    return [value.field_path, {
      sourceType: value.source_type,
      confidence: typeof value.confidence === 'number' ? value.confidence : null,
      inferred: metadata.inferred === true,
      inferenceNote: typeof metadata.inference_note === 'string' ? metadata.inference_note : null,
      evidence: evidenceByValue.get(value.id) || [],
    } satisfies CharacterFieldProvenance]
  }))
}
