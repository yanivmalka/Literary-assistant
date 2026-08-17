// ============================================
// Entity Extraction
// AI-based structured extraction via CompletionProvider.
// Uses prompts designed for fantasy text with invented names.
// Gracefully skips if no CompletionProvider available.
// ============================================

import { getCompletionProvider } from '../ai/index.js'
import type { ExtractedEntity, EntityType } from '../ai/types.js'
import { getServiceClient } from '../middleware/auth.js'

/**
 * Entity extraction configuration.
 */
export interface EntityExtractionConfig {
  batchSize: number
  delayBetweenBatchesMs: number
}

function loadConfig(): EntityExtractionConfig {
  return {
    batchSize: parseInt(process.env.ENTITY_EXTRACTION_BATCH_SIZE || '5', 10),
    delayBetweenBatchesMs: parseInt(process.env.ENTITY_EXTRACTION_DELAY_MS || '2000', 10),
  }
}

const ENTITY_TYPES: EntityType[] = [
  'character', 'location', 'country', 'continent', 'region',
  'object', 'ability', 'magic_system', 'event',
]

/**
 * Build the extraction prompt for a given text chunk.
 */
function buildExtractionPrompt(text: string): string {
  return `Extract all named entities from the following text passage from a fantasy novel.

For each entity found, provide:
- name: the entity's name as it appears in the text
- type: one of [character, location, country, continent, region, object, ability, magic_system, event]
- aliases: any alternative names or references to the same entity in this passage
- attributes: key-value pairs of properties mentioned (e.g., eye_color: blue, terrain: mountainous)
- context: a brief quote (max 30 words) showing where this entity appears

Important:
- This is a fantasy novel. Names may be invented and not found in any dictionary.
- Include ALL proper nouns that refer to characters, places, or significant items.
- Do not include common nouns or generic descriptions.
- If unsure about the type, make your best guess.

Return ONLY a valid JSON array. No other text.

Example format:
[
  {"name": "Raven", "type": "character", "aliases": [], "attributes": {"eye_color": "blue"}, "context": "Raven looked at him with her blue eyes"},
  {"name": "Tir", "type": "location", "aliases": ["The City of Tir"], "attributes": {"type": "city"}, "context": "They arrived at the gates of Tir"}
]

Text passage:
${text}`
}

/**
 * Parse the LLM response into structured entities.
 * Handles various response formats gracefully.
 */
function parseExtractionResponse(response: string): ExtractedEntity[] {
  // Try to find JSON array in the response
  let jsonStr = response.trim()

  // Sometimes LLM wraps in markdown code blocks
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim()
  }

  // Try to find array brackets
  const arrayStart = jsonStr.indexOf('[')
  const arrayEnd = jsonStr.lastIndexOf(']')
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    jsonStr = jsonStr.slice(arrayStart, arrayEnd + 1)
  }

  try {
    const parsed = JSON.parse(jsonStr)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((item: unknown) => {
        if (typeof item !== 'object' || item === null) return false
        const obj = item as Record<string, unknown>
        return typeof obj.name === 'string' && typeof obj.type === 'string'
      })
      .map((item: Record<string, unknown>) => ({
        name: (item.name as string).trim(),
        type: ENTITY_TYPES.includes(item.type as EntityType)
          ? (item.type as EntityType)
          : 'character', // default to character if unknown type
        aliases: Array.isArray(item.aliases)
          ? (item.aliases as string[]).filter(a => typeof a === 'string')
          : [],
        attributes: typeof item.attributes === 'object' && item.attributes !== null
          ? item.attributes as Record<string, string>
          : undefined,
        context: typeof item.context === 'string' ? item.context : undefined,
      }))
  } catch {
    console.warn('Failed to parse entity extraction response:', jsonStr.slice(0, 200))
    return []
  }
}

/**
 * Extract entities from all chunks of a document version.
 * Returns extracted entities (not yet deduplicated or saved).
 */
export async function extractEntitiesFromVersion(
  versionId: string,
  projectId: string,
  userId: string
): Promise<{
  entities: ExtractedEntity[]
  mentionsByEntity: Map<string, { chunkId: string; context: string; mentionText: string }[]>
  error?: string
}> {
  const provider = getCompletionProvider()
  if (!provider) {
    return {
      entities: [],
      mentionsByEntity: new Map(),
      error: 'No completion provider available — entity extraction skipped',
    }
  }

  const isAvailable = await provider.isAvailable()
  if (!isAvailable) {
    return {
      entities: [],
      mentionsByEntity: new Map(),
      error: 'Completion provider is not available — entity extraction skipped',
    }
  }

  const config = loadConfig()
  const supabase = getServiceClient()

  // Get all chunks
  const { data: chunks, error: chunksError } = await supabase
    .from('document_chunks')
    .select('id, content')
    .eq('version_id', versionId)
    .order('position', { ascending: true })

  if (chunksError || !chunks || chunks.length === 0) {
    return {
      entities: [],
      mentionsByEntity: new Map(),
      error: `Failed to fetch chunks: ${chunksError?.message || 'no chunks found'}`,
    }
  }

  // Track all extracted entities across chunks
  const allEntities: ExtractedEntity[] = []
  const mentionsByName = new Map<string, { chunkId: string; context: string; mentionText: string }[]>()

  // Process chunks in batches
  for (let i = 0; i < chunks.length; i += config.batchSize) {
    const batch = chunks.slice(i, i + config.batchSize)

    for (const chunk of batch) {
      try {
        const prompt = buildExtractionPrompt(chunk.content)
        const result = await provider.complete(prompt, {
          maxTokens: 2048,
          temperature: 0.1,
          expectJson: true,
        })

        const entities = parseExtractionResponse(result.text)

        for (const entity of entities) {
          allEntities.push(entity)

          // Track mentions
          const key = entity.name.toLowerCase()
          if (!mentionsByName.has(key)) {
            mentionsByName.set(key, [])
          }
          mentionsByName.get(key)!.push({
            chunkId: chunk.id,
            context: entity.context || chunk.content.slice(0, 200),
            mentionText: entity.name,
          })
        }
      } catch (error) {
        console.warn(`Entity extraction failed for chunk ${chunk.id}:`, error)
        // Continue with other chunks
      }
    }

    // Rate limit delay
    if (i + config.batchSize < chunks.length) {
      await new Promise(resolve => setTimeout(resolve, config.delayBetweenBatchesMs))
    }
  }

  return { entities: allEntities, mentionsByEntity: mentionsByName }
}

/**
 * Save extracted entities to the database.
 * Creates entity records with status='pending' and entity_mentions.
 */
export async function saveExtractedEntities(
  projectId: string,
  userId: string,
  entities: ExtractedEntity[],
  mentionsByEntity: Map<string, { chunkId: string; context: string; mentionText: string }[]>
): Promise<{ saved: number; error?: string }> {
  const supabase = getServiceClient()

  // Deduplicate entities by name (case-insensitive) before saving
  const uniqueEntities = new Map<string, ExtractedEntity>()
  for (const entity of entities) {
    const key = entity.name.toLowerCase()
    if (!uniqueEntities.has(key)) {
      uniqueEntities.set(key, entity)
    } else {
      // Merge aliases
      const existing = uniqueEntities.get(key)!
      if (entity.aliases) {
        existing.aliases = [...(existing.aliases || []), ...entity.aliases]
      }
    }
  }

  let saved = 0

  for (const [key, entity] of uniqueEntities) {
    try {
      // Check if entity already exists in this project
      const { data: existing } = await supabase
        .from('entities')
        .select('id')
        .eq('project_id', projectId)
        .ilike('name', entity.name)
        .limit(1)
        .single()

      let entityId: string

      if (existing) {
        entityId = existing.id
        // Update aliases if new ones found
        if (entity.aliases && entity.aliases.length > 0) {
          // Attempt to append aliases — non-critical if it fails
          const { data: currentEntity } = await supabase
            .from('entities')
            .select('aliases')
            .eq('id', entityId)
            .single()
          
          if (currentEntity) {
            const existingAliases: string[] = currentEntity.aliases || []
            const newAliases = [...new Set([...existingAliases, ...entity.aliases])]
            await supabase
              .from('entities')
              .update({ aliases: newAliases })
              .eq('id', entityId)
          }
        }
      } else {
        // Create new entity
        const { data: newEntity, error: createError } = await supabase
          .from('entities')
          .insert({
            project_id: projectId,
            user_id: userId,
            name: entity.name,
            entity_type: entity.type,
            status: 'pending',
            aliases: entity.aliases || [],
            metadata: entity.attributes ? { extracted_attributes: entity.attributes } : {},
          })
          .select('id')
          .single()

        if (createError || !newEntity) {
          console.warn(`Failed to create entity '${entity.name}':`, createError)
          continue
        }

        entityId = newEntity.id
      }

      // Save mentions
      const mentions = mentionsByEntity.get(key) || []
      if (mentions.length > 0) {
        const mentionRecords = mentions.map(m => ({
          entity_id: entityId,
          chunk_id: m.chunkId,
          context_snippet: m.context.slice(0, 500),
          mention_text: m.mentionText,
        }))

        await supabase.from('entity_mentions').insert(mentionRecords)
      }

      saved++
    } catch (error) {
      console.warn(`Error saving entity '${entity.name}':`, error)
    }
  }

  return { saved }
}
