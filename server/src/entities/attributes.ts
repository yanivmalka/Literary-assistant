// ============================================
// Entity Attribute Extraction
// For confirmed entities, re-scans their mentions to extract
// structured attributes (eye_color, height, terrain, etc.)
// Uses CompletionProvider for targeted extraction.
// ============================================

import { getCompletionProvider } from '../ai/index.js'
import { getServiceClient } from '../middleware/auth.js'

/**
 * Attribute extraction prompt by entity type.
 */
function buildAttributePrompt(entityName: string, entityType: string, contextSnippets: string[]): string {
  const context = contextSnippets.join('\n---\n')

  const typeAttributes: Record<string, string> = {
    character: 'appearance (hair_color, eye_color, height, build, skin_tone), age, gender, personality_traits, clothing, scars, tattoos, abilities, possessions',
    location: 'terrain, climate, architecture, atmosphere, size, population_type',
    country: 'government, culture, climate, geography, population',
    continent: 'size, climate_zones, notable_features',
    region: 'terrain, climate, inhabitants, notable_features',
    object: 'material, size, power, appearance, origin',
    ability: 'type, requirements, limitations, effects, cost',
    magic_system: 'source, rules, limitations, types, practitioners',
    event: 'date_or_period, participants, location, outcome, significance',
  }

  const attributes = typeAttributes[entityType] || 'any notable properties'

  return `Given the entity "${entityName}" (type: ${entityType}), extract specific attributes from the following text passages where this entity is mentioned.

Look for: ${attributes}

Return ONLY a valid JSON array of attributes. Each attribute should have:
- attribute_name: the property name (e.g., "eye_color", "terrain")
- attribute_value: the value found (e.g., "blue", "mountainous")
- confidence: how confident you are (0.0-1.0)

Only extract attributes that are explicitly stated or strongly implied in the text.
Do NOT invent or assume attributes not mentioned in the text.

Example output:
[
  {"attribute_name": "eye_color", "attribute_value": "blue", "confidence": 0.95},
  {"attribute_name": "hair_color", "attribute_value": "black", "confidence": 0.9}
]

Text passages mentioning "${entityName}":
${context}`
}

/**
 * Parse attribute extraction response.
 */
function parseAttributeResponse(response: string): { attribute_name: string; attribute_value: string; confidence: number }[] {
  let jsonStr = response.trim()

  // Handle markdown code blocks
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim()
  }

  const arrayStart = jsonStr.indexOf('[')
  const arrayEnd = jsonStr.lastIndexOf(']')
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    jsonStr = jsonStr.slice(arrayStart, arrayEnd + 1)
  }

  try {
    const parsed = JSON.parse(jsonStr)
    if (!Array.isArray(parsed)) return []

    return parsed.filter((item: unknown) => {
      if (typeof item !== 'object' || item === null) return false
      const obj = item as Record<string, unknown>
      return typeof obj.attribute_name === 'string' && typeof obj.attribute_value === 'string'
    }).map((item: Record<string, unknown>) => ({
      attribute_name: (item.attribute_name as string).toLowerCase().trim(),
      attribute_value: (item.attribute_value as string).trim(),
      confidence: typeof item.confidence === 'number' ? item.confidence : 0.7,
    }))
  } catch {
    return []
  }
}

/**
 * Extract attributes for a single entity based on its mentions.
 */
export async function extractAttributesForEntity(entityId: string): Promise<{
  extracted: number
  error?: string
}> {
  const provider = getCompletionProvider()
  if (!provider) {
    return { extracted: 0, error: 'No completion provider available' }
  }

  const supabase = getServiceClient()

  // Get entity info
  const { data: entity } = await supabase
    .from('entities')
    .select('id, name, entity_type')
    .eq('id', entityId)
    .single()

  if (!entity) {
    return { extracted: 0, error: 'Entity not found' }
  }

  // Get all mentions with context
  const { data: mentions } = await supabase
    .from('entity_mentions')
    .select('chunk_id, context_snippet')
    .eq('entity_id', entityId)
    .limit(20) // Limit to keep prompt size manageable

  if (!mentions || mentions.length === 0) {
    return { extracted: 0 }
  }

  const contextSnippets = mentions.map(m => m.context_snippet)
  const chunkIds = mentions.map(m => m.chunk_id)

  try {
    const prompt = buildAttributePrompt(entity.name, entity.entity_type, contextSnippets)
    const result = await provider.complete(prompt, {
      maxTokens: 1024,
      temperature: 0.1,
      expectJson: true,
    })

    const attributes = parseAttributeResponse(result.text)

    if (attributes.length === 0) {
      return { extracted: 0 }
    }

    // Save attributes (use first chunk as source reference)
    const records = attributes.map(attr => ({
      entity_id: entityId,
      attribute_name: attr.attribute_name,
      attribute_value: attr.attribute_value,
      source_chunk_id: chunkIds[0], // First mention chunk as source
      confidence: attr.confidence,
      data_origin: 'ai_extracted',
    }))

    const { error: insertError } = await supabase
      .from('entity_attributes')
      .insert(records)

    if (insertError) {
      return { extracted: 0, error: insertError.message }
    }

    return { extracted: attributes.length }
  } catch (error) {
    return { extracted: 0, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Extract attributes for all confirmed entities in a project.
 */
export async function extractAttributesForProject(projectId: string): Promise<{
  totalExtracted: number
  entitiesProcessed: number
  errors: string[]
}> {
  const supabase = getServiceClient()

  const { data: entities } = await supabase
    .from('entities')
    .select('id')
    .eq('project_id', projectId)
    .in('status', ['confirmed', 'pending'])

  if (!entities || entities.length === 0) {
    return { totalExtracted: 0, entitiesProcessed: 0, errors: [] }
  }

  let totalExtracted = 0
  const errors: string[] = []

  for (const entity of entities) {
    const result = await extractAttributesForEntity(entity.id)
    totalExtracted += result.extracted
    if (result.error) {
      errors.push(`Entity ${entity.id}: ${result.error}`)
    }
  }

  return { totalExtracted, entitiesProcessed: entities.length, errors }
}
