import { normalizeKey, stripNikud } from './rules/normalization.ts'

export interface AbilityReference {
  name: string
  entityType: 'ability' | 'magic_ability'
}

function referenceName(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (!value || typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  for (const key of ['name', 'ability', 'skill', 'title', 'canonical_name']) {
    if (typeof record[key] === 'string' && record[key].trim()) return record[key].trim()
  }
  return ''
}

/**
 * Reads legacy embedded skills from a character while preserving their type.
 * The active schema prefers top-level ability entities, but older/model outputs
 * may place them under character.attributes.
 */
export function getEmbeddedAbilityReferences(
  attributes: Record<string, unknown> = {},
): AbilityReference[] {
  const references: AbilityReference[] = []
  const append = (value: unknown, entityType: AbilityReference['entityType']) => {
    const values = Array.isArray(value) ? value : value == null ? [] : [value]
    for (const item of values) {
      const name = referenceName(item)
      if (!name) continue
      if (!references.some((reference) => reference.entityType === entityType && normalizeKey(reference.name) === normalizeKey(name))) {
        references.push({ name, entityType })
      }
    }
  }

  append(attributes.abilities, 'ability')
  append(attributes.life_skills, 'ability')
  append(attributes.skills, 'ability')
  append(attributes.magic_abilities, 'magic_ability')
  append(attributes.magic_skills, 'magic_ability')
  return references
}

export interface AbilityLinkEntity {
  id: string
  canonical_name: string
  entity_type: string
  aliases: string[]
  attributes: Record<string, unknown>
}

export interface AbilityLink {
  characterId: string
  abilityId: string
  abilityName: string
  userName: string
  relationshipType: 'has_ability'
}

/**
 * Build character -> ability links from normalized extraction entities.
 * Gemini returns character names in the top-level ability.users field,
 * persisted as attributes.users during normalization.
 */
export function buildAbilityLinks(entries: AbilityLinkEntity[]): AbilityLink[] {
  const links: AbilityLink[] = []
  const linkKeys = new Set<string>()

  const addLink = (character: AbilityLinkEntity, ability: AbilityLinkEntity, userName: string) => {
    const key = `${character.id}:${ability.id}:has_ability`
    if (linkKeys.has(key)) return
    linkKeys.add(key)
    links.push({
      characterId: character.id,
      abilityId: ability.id,
      abilityName: ability.canonical_name,
      userName,
      relationshipType: 'has_ability',
    })
  }

  const characters = entries.filter((entry) => entry.entity_type === 'character')
  const abilities = entries.filter((entry) => entry.entity_type === 'ability' || entry.entity_type === 'magic_ability')

  const findCharacter = (userName: string): AbilityLinkEntity | null => {
    const userKey = normalizeKey(stripNikud(userName.trim()))
    if (!userKey) return null
    const matches = characters.filter((character) =>
      normalizeKey(character.canonical_name) === userKey ||
      character.aliases.some((alias) => normalizeKey(alias) === userKey),
    )
    return [...new Set(matches.map((character) => character.id))].length === 1
      ? matches[0]
      : null
  }

  const findAbility = (name: string, entityType?: AbilityReference['entityType']): AbilityLinkEntity | null => {
    const key = normalizeKey(stripNikud(name.trim()))
    const matches = abilities.filter((ability) => {
      if (entityType && ability.entity_type !== entityType) return false
      return normalizeKey(ability.canonical_name) === key ||
        ability.aliases.some((alias) => normalizeKey(alias) === key)
    })
    return [...new Set(matches.map((ability) => ability.id))].length === 1 ? matches[0] : null
  }

  // Preferred path: Gemini lists character names in top-level ability.users.
  for (const ability of abilities) {
    const rawUsers = ability.attributes.users
    const userNames = Array.isArray(rawUsers)
      ? rawUsers.filter((user): user is string => typeof user === 'string')
      : typeof rawUsers === 'string'
        ? rawUsers.split(',').map((user) => user.trim()).filter(Boolean)
        : []

    for (const userName of userNames) {
      const character = findCharacter(userName)
      if (character) addLink(character, ability, userName)
    }
  }

  // Compatibility path: older/model outputs embed skills on the character.
  for (const character of characters) {
    for (const reference of getEmbeddedAbilityReferences(character.attributes)) {
      const ability = findAbility(reference.name, reference.entityType)
      if (ability) addLink(character, ability, character.canonical_name)
    }
  }

  return links
}
