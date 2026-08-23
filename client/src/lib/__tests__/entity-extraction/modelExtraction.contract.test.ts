import { describe, expect, it, afterEach } from 'vitest'
import {
  GEMINI_MODEL_PROFILES,
  type GeminiModelConfig,
} from '../../../../../supabase/functions/_shared/gemini-config.ts'
import { callGeminiWithFallback } from '../../../../../supabase/functions/_shared/gemini-client.ts'
import {
  buildExtractionPrompt,
  buildExtractionPromptForProfile,
} from '../../../../../supabase/functions/_shared/rules/prompt.ts'
import {
  normalizeEntities,
  type GeminiExtraction,
} from '../../../../../supabase/functions/extract-knowledge/normalization.ts'
import { parseExtractionJson } from '../../../../../supabase/functions/extract-knowledge/testable-pipeline.ts'
import { extractionFixture } from './fixtures/entityExtractionFixtures'
import {
  expectedModelTypes,
  expectedModelEntities,
  geminiResponseForExtraction,
  modelExtractionChunkLookup,
  modelExtractionChunks,
  uniqueModels,
} from './fixtures/modelExtractionFixture'
import { FakeEntityRepository } from './fakeEntityRepository'

const modelConfigs = uniqueModels(GEMINI_MODEL_PROFILES)
const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('Entity Extraction model matrix contract (offline)', () => {
  it('contains every configured model in every extraction profile', () => {
    expect(Object.keys(GEMINI_MODEL_PROFILES)).toEqual([
      'sub-base',
      'sub-base-2',
      'sub-base-locations',
      'sub-base-c-characters',
    ])
    expect(modelConfigs.map((model) => model.id)).toEqual([
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash',
    ])

    for (const [profile, models] of Object.entries(GEMINI_MODEL_PROFILES)) {
      const expectedCount = profile === 'sub-base-c-characters' ? 2 : 3
      expect(models.length, `[profile:${profile}] model count`).toBe(expectedCount)
      expect(models.map((model) => model.priority), `[profile:${profile}] priorities`).toEqual(
        profile === 'sub-base-c-characters' ? [1, 2] : [1, 2, 3],
      )
    }
  })

  it('isolates location prompt rules to sub-base-locations', () => {
    const subBasePrompt = buildExtractionPromptForProfile(modelExtractionChunks, 'sub-base')
    const subBase2Prompt = buildExtractionPromptForProfile(modelExtractionChunks, 'sub-base-2')
    const locationsPrompt = buildExtractionPromptForProfile(modelExtractionChunks, 'sub-base-locations')

    expect(subBasePrompt).not.toContain('SUB-BASE-2 PROFILE INSTRUCTIONS')
    expect(subBasePrompt).not.toContain('LOCATION EXTRACTION PROFILE INSTRUCTIONS')
    expect(subBasePrompt).not.toContain('attributes.location_fields')

    expect(subBase2Prompt).toContain('SUB-BASE-2 PROFILE INSTRUCTIONS')
    expect(subBase2Prompt).not.toContain('LOCATION EXTRACTION PROFILE INSTRUCTIONS')
    expect(subBase2Prompt).not.toContain('attributes.location_fields')

    expect(locationsPrompt.startsWith(subBase2Prompt)).toBe(true)
    expect(locationsPrompt).toContain('LOCATION EXTRACTION PROFILE INSTRUCTIONS')
    expect(locationsPrompt).toContain('attributes.place_type')
    expect(locationsPrompt).toContain('attributes.location_fields')
    expect(locationsPrompt).toContain('contained_in')
  })

  it('keeps dynamic location fields out of legacy profile normalization', () => {
    const extraction: GeminiExtraction = {
      locations: [{
        name: 'ריון',
        location_type: 'city',
        place_type: 'city',
        location_fields: { climate: 'גשום' },
        continent: 'אסיה',
        parent_location: 'ממלכת אור',
        narrative_importance: 'מרכז העלילה',
      }],
    }

    const legacy = normalizeEntities(extraction, modelExtractionChunkLookup, 'sub-base-2')[0]
    const locations = normalizeEntities(extraction, modelExtractionChunkLookup, 'sub-base-locations')[0]

    expect(legacy.structured_fields.location_type).toBe('city')
    expect(legacy.structured_fields.parent_location).toBe('ממלכת אור')
    expect(legacy.structured_fields.climate).toBeUndefined()
    expect(legacy.structured_fields.place_type).toBeUndefined()

    expect(locations.structured_fields.place_type).toBe('city')
    expect(locations.structured_fields.climate).toBe('גשום')
    expect(locations.structured_fields.continent).toBe('אסיה')
  })

  for (const model of modelConfigs) {
    it(`[model:${model.id}] sends the extraction prompt and normalizes its JSON response`, async () => {
      let requestedUrl = ''
      let requestedPayload = ''
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        requestedUrl = typeof input === 'string'
          ? input
          : 'url' in input
            ? input.url
            : input.toString()
        requestedPayload = String(init?.body || '')
        return new Response(JSON.stringify(geminiResponseForExtraction(extractionFixture)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const payload = {
        contents: [{ parts: [{ text: buildExtractionPrompt(modelExtractionChunks) }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }
      const result = await callGeminiWithFallback(payload, 'test-key', {
        timeoutMs: 1_000,
        models: [model as GeminiModelConfig],
      })

      expect(result.success, `[model:${model.id}] Gemini call`).toBe(true)
      expect(requestedUrl, `[model:${model.id}] request URL`).toContain(`/models/${model.id}:generateContent`)
      expect(requestedPayload, `[model:${model.id}] prompt`).toContain('ליאו פרוסט')

      if (!result.success) return
      expect(result.modelUsed, `[model:${model.id}] selected model`).toBe(model.id)
      const response = result.data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
      const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text || ''
      const extraction = parseExtractionJson<GeminiExtraction>(responseText)
      expect(extraction, `[model:${model.id}] JSON parsing`).not.toBeNull()
      if (!extraction) return

      const normalized = normalizeEntities(extraction, modelExtractionChunkLookup)
      const repository = new FakeEntityRepository()
      for (const entity of normalized) {
        repository.saveEntity({
          canonical_name: entity.canonical_name,
          entity_type: entity.entity_type,
          layer: 'branch',
          branch_id: `contract-${model.id}`,
          attributes: entity.attributes,
        })
      }

      for (const type of expectedModelTypes) {
        const expectedName = expectedModelEntities[type]
        const expectedKey = expectedName.toLowerCase()
        const found = normalized.some((entity) => {
          if (entity.entity_type !== type) return false
          return [entity.canonical_name, ...entity.aliases]
            .some((name) => name.toLowerCase() === expectedKey)
        })
        expect(found, `[model:${model.id}] missing ${type}: ${expectedName}`).toBe(true)
      }

      expect(repository.entities.length, `[model:${model.id}] fake persistence`).toBeGreaterThanOrEqual(expectedModelTypes.length)
      expect(repository.entities.every((entity) => entity.branch_id === `contract-${model.id}`), `[model:${model.id}] branch isolation`).toBe(true)
    })
  }
})
