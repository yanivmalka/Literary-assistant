import { supabase } from '@/lib/supabase'
import type { ExtractionModelProfile } from '@/lib/extractionModels'

export const DYNAMIC_CHARACTER_PROFILE: ExtractionModelProfile = 'sub-base-locations'

export type CharacterFieldType = 'text' | 'long_text' | 'number' | 'boolean' | 'select' | 'multi_select'

export interface CharacterFieldDefinition {
  id?: string
  project_id?: string
  model_profile: typeof DYNAMIC_CHARACTER_PROFILE
  field_key: string
  label: string
  field_type: CharacterFieldType
  group_key: string
  options: string[]
  is_active: boolean
  sort_order: number
}

/**
 * The approved character-field catalog for the locations profile.
 * Definitions are available to add in the UI; only project-enabled fields
 * are sent to the extraction prompt and only populated values are persisted.
 */
export const CHARACTER_FIELD_CATALOG: readonly CharacterFieldDefinition[] = [
  { model_profile: DYNAMIC_CHARACTER_PROFILE, field_key: 'last_name', label: 'שם משפחה', field_type: 'text', group_key: 'זהות ופרטים אישיים', options: [], is_active: true, sort_order: 10 },
  { model_profile: DYNAMIC_CHARACTER_PROFILE, field_key: 'aliases', label: 'כינויים', field_type: 'multi_select', group_key: 'זהות ופרטים אישיים', options: [], is_active: true, sort_order: 20 },
  { model_profile: DYNAMIC_CHARACTER_PROFILE, field_key: 'age', label: 'גיל', field_type: 'text', group_key: 'זהות ופרטים אישיים', options: [], is_active: true, sort_order: 30 },
  { model_profile: DYNAMIC_CHARACTER_PROFILE, field_key: 'gender', label: 'מגדר', field_type: 'text', group_key: 'זהות ופרטים אישיים', options: [], is_active: true, sort_order: 40 },
  { model_profile: DYNAMIC_CHARACTER_PROFILE, field_key: 'sexual_orientation', label: 'נטייה מינית', field_type: 'text', group_key: 'זהות ופרטים אישיים', options: [], is_active: true, sort_order: 50 },
  { model_profile: DYNAMIC_CHARACTER_PROFILE, field_key: 'favorite_food', label: 'אוכל אהוב', field_type: 'text', group_key: 'זהות ופרטים אישיים', options: [], is_active: true, sort_order: 60 },
  { model_profile: DYNAMIC_CHARACTER_PROFILE, field_key: 'occupation', label: 'מקצוע', field_type: 'text', group_key: 'זהות ופרטים אישיים', options: [], is_active: true, sort_order: 70 },
  { model_profile: DYNAMIC_CHARACTER_PROFILE, field_key: 'hobbies', label: 'תחביבים', field_type: 'long_text', group_key: 'זהות ופרטים אישיים', options: [], is_active: true, sort_order: 80 },
  { model_profile: DYNAMIC_CHARACTER_PROFILE, field_key: 'dislikes', label: 'דברים שנואים', field_type: 'long_text', group_key: 'זהות ופרטים אישיים', options: [], is_active: true, sort_order: 90 },
  { model_profile: DYNAMIC_CHARACTER_PROFILE, field_key: 'religion_and_beliefs', label: 'דת ואמונה', field_type: 'long_text', group_key: 'זהות ופרטים אישיים', options: [], is_active: true, sort_order: 100 },
  { model_profile: DYNAMIC_CHARACTER_PROFILE, field_key: 'personality_traits', label: 'תכונות אופי', field_type: 'long_text', group_key: 'תכונות', options: [], is_active: true, sort_order: 110 },
  { model_profile: DYNAMIC_CHARACTER_PROFILE, field_key: 'appearance_traits', label: 'תכונות מראה', field_type: 'long_text', group_key: 'תכונות', options: [], is_active: true, sort_order: 120 },
  { model_profile: DYNAMIC_CHARACTER_PROFILE, field_key: 'skin_color', label: 'צבע עור', field_type: 'text', group_key: 'מראה חיצוני', options: [], is_active: true, sort_order: 130 },
  { model_profile: DYNAMIC_CHARACTER_PROFILE, field_key: 'eye_color', label: 'צבע עיניים', field_type: 'text', group_key: 'מראה חיצוני', options: [], is_active: true, sort_order: 140 },
  { model_profile: DYNAMIC_CHARACTER_PROFILE, field_key: 'eye_shape', label: 'צורת עיניים', field_type: 'text', group_key: 'מראה חיצוני', options: [], is_active: true, sort_order: 150 },
  { model_profile: DYNAMIC_CHARACTER_PROFILE, field_key: 'hair_color', label: 'צבע שיער', field_type: 'text', group_key: 'מראה חיצוני', options: [], is_active: true, sort_order: 160 },
  { model_profile: DYNAMIC_CHARACTER_PROFILE, field_key: 'hair_type', label: 'סוג שיער', field_type: 'text', group_key: 'מראה חיצוני', options: [], is_active: true, sort_order: 170 },
  { model_profile: DYNAMIC_CHARACTER_PROFILE, field_key: 'tattoos', label: 'קעקועים', field_type: 'long_text', group_key: 'מראה חיצוני', options: [], is_active: true, sort_order: 180 },
  { model_profile: DYNAMIC_CHARACTER_PROFILE, field_key: 'jewelry', label: 'תכשיטים', field_type: 'long_text', group_key: 'מראה חיצוני', options: [], is_active: true, sort_order: 190 },
  { model_profile: DYNAMIC_CHARACTER_PROFILE, field_key: 'scars', label: 'צלקות', field_type: 'long_text', group_key: 'מראה חיצוני', options: [], is_active: true, sort_order: 200 },
  { model_profile: DYNAMIC_CHARACTER_PROFILE, field_key: 'body_type', label: 'מבנה גוף', field_type: 'text', group_key: 'מראה חיצוני', options: [], is_active: true, sort_order: 210 },
  { model_profile: DYNAMIC_CHARACTER_PROFILE, field_key: 'height', label: 'גובה', field_type: 'text', group_key: 'מראה חיצוני', options: [], is_active: true, sort_order: 220 },
  { model_profile: DYNAMIC_CHARACTER_PROFILE, field_key: 'race', label: 'גזע', field_type: 'text', group_key: 'עולם הדמות', options: [], is_active: true, sort_order: 230 },
  { model_profile: DYNAMIC_CHARACTER_PROFILE, field_key: 'description', label: 'תיאור כללי', field_type: 'long_text', group_key: 'ניתוח ותיאור', options: [], is_active: true, sort_order: 240 },
  { model_profile: DYNAMIC_CHARACTER_PROFILE, field_key: 'narrative_role', label: 'תפקיד בעלילה', field_type: 'long_text', group_key: 'ניתוח ותיאור', options: [], is_active: true, sort_order: 250 },
  { model_profile: DYNAMIC_CHARACTER_PROFILE, field_key: 'narrative_impact', label: 'השפעה על העלילה', field_type: 'long_text', group_key: 'ניתוח ותיאור', options: [], is_active: true, sort_order: 260 },
]

export function getCatalogCharacterField(fieldKey: string): CharacterFieldDefinition | undefined {
  return CHARACTER_FIELD_CATALOG.find(field => field.field_key === fieldKey)
}

export async function loadCharacterFieldSchema(
  projectId: string,
  profile: ExtractionModelProfile,
): Promise<CharacterFieldDefinition[]> {
  if (profile !== DYNAMIC_CHARACTER_PROFILE) return []
  const { data, error } = await supabase
    .from('knowledge_character_field_definitions')
    .select('id, project_id, model_profile, field_key, label, field_type, group_key, options, is_active, sort_order')
    .eq('project_id', projectId)
    .eq('model_profile', DYNAMIC_CHARACTER_PROFILE)
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw error
  return (data || []) as CharacterFieldDefinition[]
}

export async function enableCharacterField(
  projectId: string,
  field: CharacterFieldDefinition,
): Promise<CharacterFieldDefinition> {
  if (field.model_profile !== DYNAMIC_CHARACTER_PROFILE) {
    throw new Error('Dynamic character fields are only available in sub-base-locations')
  }
  const { data: authData } = await supabase.auth.getUser()
  if (!authData.user) throw new Error('Authentication required')
  const { data, error } = await supabase
    .from('knowledge_character_field_definitions')
    .upsert({
      project_id: projectId,
      model_profile: DYNAMIC_CHARACTER_PROFILE,
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

export function isPopulatedCharacterField(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}
