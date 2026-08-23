import { describe, expect, it } from 'vitest'
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
import { FakeEntityRepository } from './fakeEntityRepository'
import {
  expectedModelEntities,
  expectedModelTypes,
  modelExtractionChunkLookup,
  modelExtractionChunks,
  uniqueModels,
} from './fixtures/modelExtractionFixture'

type LiveExtraction = GeminiExtraction & {
  events?: unknown[]
  relationships?: unknown[]
}

const runtimeProcess = (globalThis as unknown as {
  process?: { env?: Record<string, string | undefined> }
}).process
const geminiApiKey = runtimeProcess?.env?.GEMINI_API_KEY
const modelConfigs = uniqueModels(GEMINI_MODEL_PROFILES)
const liveTimeoutMs = Number(runtimeProcess?.env?.ENTITY_EXTRACTION_MODEL_TIMEOUT_MS || 90_000)

function modelError(model: GeminiModelConfig, message: string, details?: unknown): Error {
  const suffix = details ? ` ${JSON.stringify(details)}` : ''
  return new Error(`[live model:${model.id}] ${message}${suffix}`)
}

describe.skipIf(!geminiApiKey)('Entity Extraction live model matrix (Gemini, no Supabase)', () => {
  for (const model of modelConfigs) {
    it(`[live:${model.id}] extracts and validates the fixed fixture`, async () => {
      if (!geminiApiKey) {
        throw modelError(model, 'GEMINI_API_KEY is required. Set it only in the process environment; no Supabase credentials are used.')
      }

      const result = await callGeminiWithFallback(
        {
          contents: [{ parts: [{ text: buildExtractionPrompt(modelExtractionChunks) }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8_192,
            responseMimeType: 'application/json',
          },
        },
        geminiApiKey,
        {
          timeoutMs: liveTimeoutMs,
          models: [model],
        },
      )

      if (!result.success) {
        throw modelError(model, `Gemini request failed with HTTP ${result.status}.`, result.fallbackChain)
      }
      expect(result.modelUsed, `[live:${model.id}] selected model`).toBe(model.id)

      const response = result.data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
      const responseText = response.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || ''
      const extraction = parseExtractionJson<LiveExtraction>(responseText)
      expect(extraction, `[live:${model.id}] valid JSON response`).not.toBeNull()
      if (!extraction) return

      const normalized = normalizeEntities(extraction, modelExtractionChunkLookup)
      const repository = new FakeEntityRepository()
      for (const entity of normalized) {
        repository.saveEntity({
          canonical_name: entity.canonical_name,
          entity_type: entity.entity_type,
          layer: 'branch',
          branch_id: `live-${model.id}`,
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
        expect(found, `[live:${model.id}] missing ${type}: ${expectedName}`).toBe(true)
      }

      const rawEvents = Array.isArray(extraction.events) ? extraction.events : []
      const rawRelationships = Array.isArray(extraction.relationships) ? extraction.relationships : []
      expect(rawEvents.length, `[live:${model.id}] event extraction`).toBeGreaterThan(0)
      expect(rawRelationships.length, `[live:${model.id}] relationship extraction`).toBeGreaterThan(0)
      expect(repository.entities.length, `[live:${model.id}] fake persistence`).toBeGreaterThanOrEqual(expectedModelTypes.length)
      expect(repository.entities.every((entity) => entity.branch_id === `live-${model.id}`), `[live:${model.id}] no Main writes`).toBe(true)
    }, liveTimeoutMs + 5_000)
  }
})
