import type { GeminiModelConfig } from '../../../../../../supabase/functions/_shared/gemini-config.ts'

export const modelExtractionChunks = [
  { position: 0, content: 'זהו קטע בדיקה קבוע לחילוץ ישויות. ליאו פרוסט הוא גיבור בן 25 עם שיער שחור ועיניים כחולות.' },
  { position: 1, content: 'ליאו פרוסט הגיע ליער אירויין, מקום סודי וחשוב, כשהוא נושא את קלטון, חפץ קסום עשוי כסף.' },
  { position: 2, content: 'ליאו פרוסט משתמש ביכולת לחימה בשתי חרבות וביכולת קסומה בשם רונת אש. היכולת רונת אש מופעלת באמצעות רונה.' },
  { position: 3, content: 'בקרב ההרים ליאו פרוסט השתמש בקלטון. זהו אירוע משמעותי שבו ליאו פרוסט היה בעליו של קלטון.' },
]

export const modelExtractionChunkLookup = new Map<number, { id: string; page: number | null }>([
  [0, { id: 'model-chunk-character', page: 201 }],
  [1, { id: 'model-chunk-location-object', page: 202 }],
  [2, { id: 'model-chunk-abilities', page: 203 }],
  [3, { id: 'model-chunk-event-relationship', page: 204 }],
])

export const expectedModelEntities = {
  character: 'ליאו פרוסט',
  location: 'יער אירויין',
  object: 'קלטון',
  ability: 'לחימה בשתי חרבות',
  magic_ability: 'רונת אש',
} as const

export const expectedModelTypes = Object.keys(expectedModelEntities) as Array<keyof typeof expectedModelEntities>

export function uniqueModels(profiles: Record<string, GeminiModelConfig[]>): GeminiModelConfig[] {
  const models = new Map<string, GeminiModelConfig>()
  for (const profile of Object.values(profiles)) {
    for (const model of profile) {
      if (!models.has(model.id)) models.set(model.id, model)
    }
  }
  return [...models.values()].sort((left, right) => left.priority - right.priority)
}

export function geminiResponseForExtraction(extraction: unknown): Record<string, unknown> {
  return {
    candidates: [{ content: { parts: [{ text: JSON.stringify(extraction) }] } }],
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 200, totalTokenCount: 300 },
  }
}
