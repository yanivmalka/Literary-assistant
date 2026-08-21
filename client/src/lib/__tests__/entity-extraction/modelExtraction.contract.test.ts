import { describe, expect, it, afterEach } from 'vitest'
import {
  GEMINI_MODEL_PROFILES,
  type GeminiModelConfig,
} from '../../../../../supabase/functions/_shared/gemini-config.ts'
import { callGeminiWithFallback } from '../../../../../supabase/functions/_shared/gemini-client.ts'
import { buildExtractionPrompt } from '../../../../../supabase/functions/_shared/rules/prompt.ts'
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
    expect(Object.keys(GEMINI_MODEL_PROFILES)).toEqual(['current', 'development'])
    expect(modelConfigs.map((model) => model.id)).toEqual([
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-2.5-flash',
    ])

    for (const [profile, models] of Object.entries(GEMINI_MODEL_PROFILES)) {
      expect(models.length, `[profile:${profile}] model count`).toBe(3)
      expect(models.map((model) => model.priority), `[profile:${profile}] priorities`).toEqual([1, 2, 3])
    }
  })

  for (const model of modelConfigs) {
    it(`[model:${model.id}] sends the extraction prompt and normalizes its JSON response`, async () => {
      let requestedUrl = ''
      let requestedPayload = ''
      globalThis.fetch = async (input, init) => {
        requestedUrl = typeof input === 'string' ? input : input.url
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
