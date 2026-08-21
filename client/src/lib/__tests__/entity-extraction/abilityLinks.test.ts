import { describe, expect, it } from 'vitest'
import { buildAbilityLinks, type AbilityLinkEntity } from '../../../../../supabase/functions/_shared/ability-links'

function entity(overrides: Partial<AbilityLinkEntity>): AbilityLinkEntity {
  return {
    id: 'entity-id',
    canonical_name: 'Entity',
    entity_type: 'character',
    aliases: [],
    attributes: {},
    ...overrides,
  }
}

describe('ability relationship extraction', () => {
  it('links physical and magical abilities to the named character', () => {
    const links = buildAbilityLinks([
      entity({ id: 'alina', canonical_name: 'אלינה' }),
      entity({
        id: 'two-swords',
        canonical_name: 'לחימה בשתי חרבות',
        entity_type: 'ability',
        attributes: { users: ['אלינה'] },
      }),
      entity({
        id: 'energy-healing',
        canonical_name: 'ריפוי אנרגטי',
        entity_type: 'magic_ability',
        attributes: { users: ['אלינה'] },
      }),
    ])

    expect(links).toEqual([
      {
        characterId: 'alina',
        abilityId: 'two-swords',
        abilityName: 'לחימה בשתי חרבות',
        userName: 'אלינה',
        relationshipType: 'has_ability',
      },
      {
        characterId: 'alina',
        abilityId: 'energy-healing',
        abilityName: 'ריפוי אנרגטי',
        userName: 'אלינה',
        relationshipType: 'has_ability',
      },
    ])
  })

  it('resolves a character alias and accepts comma-separated users', () => {
    const links = buildAbilityLinks([
      entity({ id: 'leo', canonical_name: 'ליאו פרוסט', aliases: ['ליאו'] }),
      entity({
        id: 'lip-reading',
        canonical_name: 'קריאת שפתיים',
        entity_type: 'ability',
        attributes: { users: 'ליאו' },
      }),
    ])

    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ characterId: 'leo', abilityId: 'lip-reading' })
  })

  it('does not create an ambiguous character link', () => {
    const links = buildAbilityLinks([
      entity({ id: 'leo-one', canonical_name: 'ליאו' }),
      entity({ id: 'leo-two', canonical_name: 'ליאו' }),
      entity({
        id: 'sword',
        canonical_name: 'לחימה',
        entity_type: 'ability',
        attributes: { users: ['ליאו'] },
      }),
    ])

    expect(links).toEqual([])
  })
})
