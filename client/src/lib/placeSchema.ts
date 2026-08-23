import { supabase } from '@/lib/supabase'

export type PlaceCategory = 'cosmic' | 'geography' | 'governance' | 'settlement' | 'structure' | 'dwelling' | 'custom'
export type PlaceFieldType = 'text' | 'long_text' | 'number' | 'boolean' | 'select' | 'multi_select'

export interface PlaceTypeDefinition {
  id?: string
  project_id?: string | null
  type_key: string
  label: string
  category: PlaceCategory
  is_system: boolean
}

export interface PlaceFieldDefinition {
  id?: string
  project_id?: string
  place_type_key: string
  field_key: string
  label: string
  field_type: PlaceFieldType
  options: string[]
  group_key: string
  is_required: boolean
  sort_order: number
  is_active: boolean
}

const type = (type_key: string, label: string, category: PlaceCategory): PlaceTypeDefinition => ({
  type_key,
  label,
  category,
  is_system: true,
})

export const FALLBACK_PLACE_TYPES: PlaceTypeDefinition[] = [
  type('universe', 'יקום', 'cosmic'), type('parallel_universe', 'יקום מקביל', 'cosmic'),
  type('dimension', 'ממד', 'cosmic'), type('plane', 'מישור', 'cosmic'), type('galaxy', 'גלקסיה', 'cosmic'),
  type('star_system', 'מערכת כוכבים', 'cosmic'), type('world', 'עולם', 'cosmic'), type('moon', 'ירח', 'cosmic'),
  type('continent', 'יבשת', 'geography'), type('subcontinent', 'תת־יבשת', 'geography'), type('island', 'אי', 'geography'),
  type('archipelago', 'ארכיפלג', 'geography'), type('peninsula', 'חצי־אי', 'geography'), type('sea', 'ים', 'geography'),
  type('ocean', 'אוקיינוס', 'geography'), type('lake', 'אגם', 'geography'), type('river', 'נהר', 'geography'),
  type('mountain', 'הר', 'geography'), type('mountain_range', 'רכס הרים', 'geography'), type('desert', 'מדבר', 'geography'),
  type('forest', 'יער', 'geography'), type('natural_region', 'אזור טבעי', 'geography'), type('country', 'מדינה', 'governance'),
  type('province', 'מחוז', 'governance'), type('kingdom', 'ממלכה', 'governance'), type('colony', 'קולוניה', 'governance'),
  type('empire', 'אימפריה', 'governance'), type('territory', 'טריטוריה', 'governance'), type('principality', 'נסיכות', 'governance'),
  type('duchy', 'דוכסות', 'governance'), type('republic', 'רפובליקה', 'governance'), type('city_state', 'עיר־מדינה', 'governance'),
  type('city', 'עיר', 'settlement'), type('capital', 'עיר בירה', 'settlement'), type('town', 'עיירה', 'settlement'),
  type('village', 'כפר', 'settlement'), type('colony_settlement', 'מושבה', 'settlement'), type('settlement', 'יישוב', 'settlement'),
  type('farm', 'חווה', 'settlement'), type('fief', 'פלך', 'settlement'), type('trading_post', 'תחנת מסחר', 'settlement'),
  type('outpost', 'מאחז', 'settlement'), type('neighborhood', 'שכונה', 'structure'), type('district', 'רובע', 'structure'),
  type('street', 'רחוב', 'structure'), type('square', 'כיכר', 'structure'), type('market', 'שוק', 'structure'),
  type('harbor', 'נמל', 'structure'), type('complex', 'מתחם', 'structure'), type('building', 'בניין', 'structure'),
  type('villa', 'וילה', 'structure'), type('fort', 'מבצר', 'structure'), type('castle', 'טירה', 'structure'),
  type('palace', 'ארמון', 'structure'), type('temple', 'מקדש', 'structure'), type('place_of_worship', 'בית תפילה', 'structure'),
  type('tower', 'מגדל', 'structure'), type('house', 'בית', 'dwelling'), type('cabin', 'בקתה', 'dwelling'),
  type('apartment', 'דירה', 'dwelling'), type('room', 'חדר', 'dwelling'), type('tent', 'אוהל', 'dwelling'),
  type('basement', 'מרתף', 'dwelling'), type('attic', 'עליית גג', 'dwelling'), type('courtyard', 'חצר', 'dwelling'),
  type('garden', 'גן', 'dwelling'), type('other', 'אחר', 'custom'),
]

const field = (field_key: string, label: string, field_type: PlaceFieldType = 'text', group_key = 'פרטים נוספים'): PlaceFieldDefinition => ({
  place_type_key: '*', field_key, label, field_type, options: [], group_key, is_required: false, sort_order: 0, is_active: true,
})

const COMMON_FIELDS = [
  field('description', 'תיאור', 'long_text', 'פרטים בסיסיים'),
  field('narrative_importance', 'חשיבות לעלילה', 'long_text', 'הקשר סיפורי'),
  field('narrative_impact', 'השפעה על העלילה', 'long_text', 'הקשר סיפורי'),
  field('notes', 'הערות', 'long_text', 'הערות'),
]

const CATEGORY_FIELDS: Record<PlaceCategory, PlaceFieldDefinition[]> = {
  cosmic: [
    field('parent_celestial_body', 'גוף שמימי מכיל', 'text', 'מאפיינים קוסמולוגיים'),
    field('cosmic_scale', 'קנה מידה קוסמולוגי', 'text', 'מאפיינים קוסמולוגיים'),
    field('atmosphere', 'אטמוספרה', 'long_text', 'מאפיינים קוסמולוגיים'),
    field('climate', 'אקלים', 'long_text', 'מאפיינים קוסמולוגיים'),
    field('physical_rules', 'חוקים פיזיקליים או קסומים', 'long_text', 'מאפיינים קוסמולוגיים'),
  ],
  geography: [
    field('terrain', 'תוואי שטח', 'long_text', 'מאפיינים גאוגרפיים'),
    field('climate', 'אקלים', 'long_text', 'מאפיינים גאוגרפיים'),
    field('natural_resources', 'משאבים טבעיים', 'long_text', 'מאפיינים גאוגרפיים'),
    field('boundaries', 'גבולות ותיחום', 'long_text', 'מאפיינים גאוגרפיים'),
  ],
  governance: [
    field('sovereign_power', 'הכוח הריבוני', 'text', 'שלטון'),
    field('government_type', 'צורת שלטון', 'text', 'שלטון'),
    field('political_status', 'מעמד פוליטי', 'text', 'שלטון'),
    field('laws', 'חוקים וכללים', 'long_text', 'שלטון'),
  ],
  settlement: [
    field('population', 'אוכלוסייה', 'number', 'יישוב'),
    field('economy', 'כלכלה', 'long_text', 'יישוב'),
    field('founded_at', 'מועד הקמה', 'text', 'יישוב'),
    field('notable_landmarks', 'אתרים בולטים', 'long_text', 'יישוב'),
  ],
  structure: [
    field('purpose', 'ייעוד', 'long_text', 'מבנה'),
    field('architecture', 'אדריכלות', 'long_text', 'מבנה'),
    field('owner', 'בעלות או שליטה', 'text', 'מבנה'),
    field('access_rules', 'כללי גישה', 'long_text', 'מבנה'),
  ],
  dwelling: [
    field('occupants', 'דיירים או שוהים', 'long_text', 'מגורים וחללים'),
    field('capacity', 'קיבולת', 'number', 'מגורים וחללים'),
    field('purpose', 'ייעוד', 'long_text', 'מגורים וחללים'),
    field('access_rules', 'כללי גישה', 'long_text', 'מגורים וחללים'),
  ],
  custom: [],
}

export interface PlaceSchema {
  types: PlaceTypeDefinition[]
  customFields: PlaceFieldDefinition[]
}

export function getPlaceType(types: PlaceTypeDefinition[], key: string | null | undefined): PlaceTypeDefinition {
  return types.find(item => item.type_key === key) || FALLBACK_PLACE_TYPES.find(item => item.type_key === key) || FALLBACK_PLACE_TYPES[FALLBACK_PLACE_TYPES.length - 1]
}

export function getPlaceFields(placeTypeKey: string, schema: PlaceSchema): PlaceFieldDefinition[] {
  const placeType = getPlaceType(schema.types, placeTypeKey)
  const builtIn = [...COMMON_FIELDS, ...(CATEGORY_FIELDS[placeType.category] || [])]
    .map(item => ({ ...item, place_type_key: placeTypeKey }))
  const custom = schema.customFields.filter(item => item.is_active && (item.place_type_key === '*' || item.place_type_key === placeTypeKey))
  const seen = new Set<string>()
  return [...builtIn, ...custom]
    .filter(item => !seen.has(item.field_key) && seen.add(item.field_key))
    .map((item, index) => ({ ...item, sort_order: item.sort_order || index }))
}

export async function loadPlaceSchema(projectId: string): Promise<PlaceSchema> {
  const [typesResult, fieldsResult] = await Promise.all([
    supabase.from('knowledge_place_types').select('id, project_id, type_key, label, category, is_system').or(`project_id.is.null,project_id.eq.${projectId}`).order('label'),
    supabase.from('knowledge_place_field_definitions').select('*').eq('project_id', projectId).eq('is_active', true).order('sort_order'),
  ])

  const types = typesResult.error || !typesResult.data?.length
    ? FALLBACK_PLACE_TYPES
    : typesResult.data as PlaceTypeDefinition[]
  return { types, customFields: fieldsResult.error ? [] : (fieldsResult.data || []) as PlaceFieldDefinition[] }
}

export function toPlaceTypeKey(label: string): string {
  const normalized = label.trim().toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '')
  return normalized.slice(0, 70) || `custom_${Date.now()}`
}

export async function createCustomPlaceType(projectId: string, label: string, userId: string): Promise<PlaceTypeDefinition> {
  const typeKey = toPlaceTypeKey(label)
  const { data, error } = await supabase.from('knowledge_place_types').insert({
    project_id: projectId, type_key: typeKey, label: label.trim(), category: 'custom', is_system: false, created_by: userId,
  }).select('id, project_id, type_key, label, category, is_system').single()
  if (error || !data) throw error || new Error('Failed to create place type')
  return data as PlaceTypeDefinition
}

export async function createCustomPlaceField(params: {
  projectId: string
  userId: string
  placeTypeKey: string
  label: string
  fieldType?: PlaceFieldType
}): Promise<PlaceFieldDefinition> {
  const fieldKey = toPlaceTypeKey(params.label)
  const { data, error } = await supabase.from('knowledge_place_field_definitions').insert({
    project_id: params.projectId,
    place_type_key: params.placeTypeKey || '*',
    field_key: fieldKey,
    label: params.label.trim(),
    field_type: params.fieldType || 'text',
    options: [],
    group_key: 'שדות מותאמים אישית',
    created_by: params.userId,
  }).select('*').single()
  if (error || !data) throw error || new Error('Failed to create place field')
  return data as PlaceFieldDefinition
}
