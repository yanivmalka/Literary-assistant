// Fantasy name generator - syllable-based with compound name support
// Fixes: no final letters mid-word, shorter names, easier pronunciation, compound names

// ===== HEBREW =====

// Easy-to-pronounce Hebrew syllables (consonant-vowel pairs)
const HE_OPEN_SYLLABLES = [
  'רא', 'לא', 'נא', 'מא', 'שא', 'דא', 'בא',
  'רי', 'לי', 'ני', 'מי', 'שי', 'די', 'בי', 'גי', 'תי',
  'רו', 'לו', 'נו', 'מו', 'שו', 'דו', 'בו', 'גו', 'תו',
  'רה', 'לה', 'נה', 'מה', 'שה', 'דה', 'בה',
  'כי', 'פי', 'צי', 'קי', 'חי', 'זי',
  'כו', 'פו', 'צו', 'קו', 'חו', 'זו',
  'גל', 'דל', 'בל', 'של', 'נל',
  'אל', 'אר', 'אש',
]

// Closed syllables (consonant-vowel-consonant) - for endings
const HE_CLOSED_ENDINGS = [
  'ר', 'ל', 'ד', 'ת', 'ן', 'ם', 'ש', 'ב',
]

// Hebrew place-type words for compound names
const HE_PLACE_PREFIXES = [
  'הר', 'גבעת', 'עמק', 'נחל', 'מעבר', 'שער', 'צוק', 'מגדל',
  'חוף', 'אי', 'מפרץ', 'כף', 'רכס', 'סלע', 'קצה', 'מישור',
  'יער', 'חורש', 'בקעת', 'מדבר', 'נאות', 'מעיין', 'בארות',
]

// Evocative Hebrew words for compound names
const HE_DESCRIPTORS = [
  'הנשרים', 'הברזל', 'השחר', 'הזהב', 'הכסף', 'האש',
  'הרוח', 'הסער', 'השלג', 'הקרח', 'האבן', 'העצים',
  'החושך', 'האור', 'הצל', 'הערפל', 'הדם', 'העופרת',
  'השועלים', 'הזאבים', 'הדרקונים', 'הנחשים', 'העורבים',
  'העתיק', 'הנשכח', 'האבוד', 'הקדוש', 'הארור', 'הנסתר',
  'השבור', 'הבודד', 'האחרון', 'הראשון', 'הגדול',
]

// ===== ENGLISH =====

// English compound name components
const EN_PLACE_PREFIXES = [
  'Mount', 'Fort', 'Castle', 'Tower', 'Bridge', 'Cape', 'Bay',
  'Lake', 'River', 'Valley', 'Peak', 'Ridge', 'Cliff', 'Gate',
  'Port', 'Isle', 'Forest', 'Marsh', 'Plains', 'Canyon',
]

const EN_DESCRIPTORS = [
  'of Eagles', 'of Iron', 'of Dawn', 'of Gold', 'of Silver',
  'of Fire', 'of Storms', 'of Snow', 'of Ice', 'of Stone',
  'of Shadows', 'of Light', 'of Mist', 'of Blood', 'of Bones',
  'of Wolves', 'of Dragons', 'of Ravens', 'of Serpents',
  'the Ancient', 'the Forgotten', 'the Lost', 'the Sacred',
  'the Cursed', 'the Hidden', 'the Broken', 'the Last',
]

// Short English fantasy syllables
const EN_FIRST = ['Ael', 'Ar', 'Bal', 'Cor', 'Dal', 'El', 'Fen', 'Gal', 'Hal', 'Kal', 'Lor', 'Mal', 'Nar', 'Pel', 'Ral', 'Tal', 'Val', 'Zel']
const EN_MID = ['an', 'ar', 'en', 'il', 'or', 'un', 'ir', 'al']
const EN_END = ['a', 'or', 'on', 'en', 'ar', 'dale', 'ford', 'hold', 'mere', 'haven', 'fell', 'heim']

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function generateHebrewSyllableName(): string {
  // Generate 2-3 syllables (short, easy to pronounce)
  const count = Math.random() < 0.6 ? 2 : 3
  let name = ''
  for (let i = 0; i < count; i++) {
    name += randomFrom(HE_OPEN_SYLLABLES)
  }
  // Optionally add a closing consonant (non-final form)
  if (Math.random() > 0.4) {
    name += randomFrom(HE_CLOSED_ENDINGS)
  }
  return name
}

function generateHebrewCompoundName(): string {
  const prefix = randomFrom(HE_PLACE_PREFIXES)
  const descriptor = randomFrom(HE_DESCRIPTORS)
  return `${prefix} ${descriptor}`
}

function generateEnglishSyllableName(): string {
  const first = randomFrom(EN_FIRST)
  const hasMid = Math.random() > 0.5
  const mid = hasMid ? randomFrom(EN_MID) : ''
  const end = randomFrom(EN_END)
  return first + mid + end
}

function generateEnglishCompoundName(): string {
  const prefix = randomFrom(EN_PLACE_PREFIXES)
  const descriptor = randomFrom(EN_DESCRIPTORS)
  return `${prefix} ${descriptor}`
}

/**
 * Generate fantasy place names appropriate for the given language.
 * Mix of syllable-based names and compound descriptive names.
 * @param lang - 'he' for Hebrew, 'en' for English
 * @param count - number of names to generate (default 5)
 */
export function generateFantasyNames(lang: string, count: number = 5): string[] {
  const names = new Set<string>()

  while (names.size < count) {
    // ~40% compound names, ~60% syllable names
    const useCompound = Math.random() < 0.4

    let name: string
    if (lang === 'he') {
      name = useCompound ? generateHebrewCompoundName() : generateHebrewSyllableName()
    } else {
      name = useCompound ? generateEnglishCompoundName() : generateEnglishSyllableName()
    }

    if (name.length >= 3) {
      names.add(name)
    }
  }

  return Array.from(names)
}
