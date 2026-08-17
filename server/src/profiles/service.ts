// ============================================
// Profile Service
// Handles creation of profiles from entities,
// field source tracking, and edit protection.
// user_edited fields are NEVER overwritten by AI.
// ============================================

import { getServiceClient } from '../middleware/auth.js'

/**
 * Profile field source types.
 */
export type FieldSourceType = 'document_extracted' | 'user_defined' | 'user_edited'

/**
 * Character profile schema.
 */
export interface CharacterProfileData {
  name?: string
  age?: string
  gender?: string
  hair_color?: string
  eye_color?: string
  height?: string
  build?: string
  skin_tone?: string
  clothing?: string
  scars?: string
  tattoos?: string
  personality?: string
  abilities?: string
  possessions?: string
  notes?: string
}

/**
 * Environment profile schema.
 */
export interface EnvironmentProfileData {
  name?: string
  type?: string
  description?: string
  climate?: string
  terrain?: string
  architecture?: string
  atmosphere?: string
  population?: string
  location_hierarchy?: string
  importance?: string
  character_connections?: string
  notes?: string
}

/**
 * Create a profile from a confirmed entity.
 * Pre-fills profile_data from entity_attributes.
 * Records field sources as 'document_extracted'.
 */
export async function createProfileFromEntity(
  entityId: string,
  projectId: string,
  userId: string
): Promise<{ profileId: string | null; error?: string }> {
  const supabase = getServiceClient()

  // Get entity
  const { data: entity } = await supabase
    .from('entities')
    .select('id, name, entity_type, status')
    .eq('id', entityId)
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .single()

  if (!entity) {
    return { profileId: null, error: 'Entity not found' }
  }

  // Check if profile already exists for this entity
  const { data: existing } = await supabase
    .from('profiles_base')
    .select('id')
    .eq('entity_id', entityId)
    .limit(1)
    .single()

  if (existing) {
    return { profileId: existing.id, error: 'Profile already exists for this entity' }
  }

  // Get entity attributes
  const { data: attributes } = await supabase
    .from('entity_attributes')
    .select('attribute_name, attribute_value, source_chunk_id')
    .eq('entity_id', entityId)

  // Map entity_type to profile_type
  const profileTypeMap: Record<string, string> = {
    character: 'character',
    location: 'environment',
    country: 'environment',
    continent: 'environment',
    region: 'environment',
    object: 'object',
    ability: 'ability',
    magic_system: 'ability',
    event: 'object', // events don't have a dedicated profile type yet
  }
  const profileType = profileTypeMap[entity.entity_type] || 'character'

  // Build profile_data from attributes
  const profileData: Record<string, string> = { name: entity.name }
  const fieldSources: { field_path: string; source_type: FieldSourceType; source_chunk_id: string | null }[] = []

  if (attributes) {
    for (const attr of attributes) {
      profileData[attr.attribute_name] = attr.attribute_value
      fieldSources.push({
        field_path: attr.attribute_name,
        source_type: 'document_extracted',
        source_chunk_id: attr.source_chunk_id,
      })
    }
  }

  // Create profile
  const { data: profile, error: createError } = await supabase
    .from('profiles_base')
    .insert({
      entity_id: entityId,
      project_id: projectId,
      user_id: userId,
      profile_type: profileType,
      profile_data: profileData,
    })
    .select('id')
    .single()

  if (createError || !profile) {
    return { profileId: null, error: createError?.message || 'Failed to create profile' }
  }

  // Save field sources
  if (fieldSources.length > 0) {
    const sourceRecords = fieldSources.map(fs => ({
      profile_id: profile.id,
      field_path: fs.field_path,
      source_type: fs.source_type,
      source_chunk_id: fs.source_chunk_id,
    }))
    await supabase.from('profile_field_sources').insert(sourceRecords)
  }

  return { profileId: profile.id }
}

/**
 * Update a profile field.
 * If the field was previously 'document_extracted', mark it as 'user_edited'.
 * user_edited fields are NEVER overwritten by future document analysis.
 */
export async function updateProfileField(
  profileId: string,
  fieldPath: string,
  value: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getServiceClient()

  // Verify ownership
  const { data: profile } = await supabase
    .from('profiles_base')
    .select('id, profile_data')
    .eq('id', profileId)
    .eq('user_id', userId)
    .single()

  if (!profile) {
    return { success: false, error: 'Profile not found' }
  }

  // Update profile_data
  const profileData = (profile.profile_data as Record<string, unknown>) || {}
  profileData[fieldPath] = value

  await supabase
    .from('profiles_base')
    .update({ profile_data: profileData })
    .eq('id', profileId)

  // Update or create field source
  const { data: existingSource } = await supabase
    .from('profile_field_sources')
    .select('id, source_type')
    .eq('profile_id', profileId)
    .eq('field_path', fieldPath)
    .single()

  if (existingSource) {
    // Mark as user_edited (was extracted, now user changed it)
    const newSourceType: FieldSourceType = existingSource.source_type === 'user_defined'
      ? 'user_defined'
      : 'user_edited'

    await supabase
      .from('profile_field_sources')
      .update({ source_type: newSourceType, last_modified_at: new Date().toISOString() })
      .eq('id', existingSource.id)
  } else {
    // New field added by user
    await supabase
      .from('profile_field_sources')
      .insert({
        profile_id: profileId,
        field_path: fieldPath,
        source_type: 'user_defined',
      })
  }

  return { success: true }
}
