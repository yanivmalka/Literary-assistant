import { normalizeKey, stripNikud } from './rules/normalization.ts'

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

  for (const ability of entries) {
    if (ability.entity_type !== 'ability' && ability.entity_type !== 'magic_ability') continue

    const rawUsers = ability.attributes.users
    const userNames = Array.isArray(rawUsers)
      ? rawUsers.filter((user): user is string => typeof user === 'string')
      : typeof rawUsers === 'string'
        ? rawUsers.split(',').map((user) => user.trim()).filter(Boolean)
        : []

    for (const userName of userNames) {
      const userKey = normalizeKey(stripNikud(userName.trim()))
      if (!userKey) continue

      const matchingCharacters = entries.filter((entity) => {
        if (entity.entity_type !== 'character') return false
        return normalizeKey(entity.canonical_name) === userKey ||
          entity.aliases.some((alias) => normalizeKey(alias) === userKey)
      })

      const uniqueCharacterIds = [...new Set(matchingCharacters.map((entity) => entity.id))]
      if (uniqueCharacterIds.length !== 1) continue

      links.push({
        characterId: uniqueCharacterIds[0],
        abilityId: ability.id,
        abilityName: ability.canonical_name,
        userName,
        relationshipType: 'has_ability',
      })
    }
  }

  return links
}
