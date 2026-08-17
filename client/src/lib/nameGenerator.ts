// Fantasy name generator using syllable combination
// Generates names appropriate for the user's language

// Hebrew syllable patterns for name generation
const HE_ENDINGS = ['ן', 'ם', 'ת', 'ה', 'ר', 'ל', 'ד']

// Hebrew syllable patterns (consonant + vowel combinations)
const HE_SYLLABLES = [
  'אל', 'אר', 'אש', 'בר', 'גל', 'דר', 'הר', 'זר', 'חל', 'טל',
  'יר', 'כר', 'לב', 'מר', 'נר', 'סל', 'עד', 'פר', 'צר', 'קר',
  'רם', 'שם', 'תל', 'גן', 'דן', 'בן', 'מן', 'נן', 'עם', 'רן',
  'שר', 'תר', 'אד', 'בל', 'גר', 'דל', 'הד', 'ול', 'זן', 'חר',
  'טר', 'יד', 'כל', 'לד', 'מד', 'נד', 'סר', 'עז', 'פל', 'צל',
  'קל', 'רד', 'שד', 'תד', 'אן', 'בד', 'גד', 'דם', 'הל', 'ור',
  'נה', 'מה', 'לה', 'שה', 'רה', 'תה', 'יה', 'אה',
  'רי', 'לי', 'ני', 'מי', 'שי', 'תי', 'די', 'גי',
  'נו', 'מו', 'רו', 'לו', 'שו', 'תו', 'דו', 'גו',
]

// English syllables for fantasy names
const EN_PREFIXES = ['Ael', 'Ar', 'Bal', 'Bel', 'Car', 'Cor', 'Dal', 'Dor', 'El', 'Fen', 'Gal', 'Gor', 'Hal', 'Ith', 'Kal', 'Lor', 'Mal', 'Nar', 'Or', 'Pel', 'Quel', 'Ral', 'Sal', 'Tal', 'Val', 'Wyn', 'Zel']
const EN_MIDDLES = ['an', 'ar', 'el', 'en', 'il', 'in', 'ir', 'on', 'or', 'un', 'ur', 'al', 'ol', 'ath', 'eth', 'ith', 'oth', 'uth', 'aer', 'ier']
const EN_SUFFIXES = ['a', 'ia', 'or', 'on', 'an', 'en', 'in', 'ar', 'ir', 'dale', 'vale', 'ford', 'heim', 'hold', 'mere', 'stead', 'wick', 'haven', 'fell', 'ton', 'burg', 'peak', 'wood', 'glen']

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function weightedSyllableCount(): number {
  // 3-5 syllables more frequent, 2 and 6-7 less frequent
  const weights = [
    { count: 2, weight: 10 },
    { count: 3, weight: 30 },
    { count: 4, weight: 30 },
    { count: 5, weight: 20 },
    { count: 6, weight: 7 },
    { count: 7, weight: 3 },
  ]
  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0)
  let random = Math.random() * totalWeight
  for (const w of weights) {
    random -= w.weight
    if (random <= 0) return w.count
  }
  return 4
}

function generateHebrewName(): string {
  const syllableCount = weightedSyllableCount()
  let name = ''
  for (let i = 0; i < syllableCount; i++) {
    name += randomFrom(HE_SYLLABLES)
  }
  // Optionally add ending
  if (Math.random() > 0.5) {
    name += randomFrom(HE_ENDINGS)
  }
  return name
}

function generateEnglishName(): string {
  const prefix = randomFrom(EN_PREFIXES)
  const hasMiddle = Math.random() > 0.4
  const middle = hasMiddle ? randomFrom(EN_MIDDLES) : ''
  const suffix = randomFrom(EN_SUFFIXES)
  return prefix + middle + suffix
}

/**
 * Generate fantasy place names appropriate for the given language
 * @param lang - 'he' for Hebrew, 'en' for English
 * @param count - number of names to generate (default 5)
 */
export function generateFantasyNames(lang: string, count: number = 5): string[] {
  const names = new Set<string>()
  const generator = lang === 'he' ? generateHebrewName : generateEnglishName

  while (names.size < count) {
    const name = generator()
    if (name.length >= 3 && name.length <= 12) {
      names.add(name)
    }
  }

  return Array.from(names)
}
