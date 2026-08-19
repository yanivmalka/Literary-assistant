// ============================================
// Multi-Language Rules System
// ============================================
// Defines language-specific patterns for character and location filtering.
// Supports Hebrew, English, and extensible for future languages.
// ============================================

export type LanguageCode = 'he' | 'en' | 'ar' | 'fr' | 'de' | 'es' | 'it' | 'pt' | 'ru' | 'ja' | 'zh';

/**
 * Character blocking patterns by language.
 * Each language has:
 * - familyRoles: regex for family relationships (father, mother, brother, etc.)
 * - genericDescriptors: regex for generic role descriptors (the man, the wizard, etc.)
 * - relationshipReferences: regex for "X של Y" style references
 */
export const CHARACTER_PATTERNS_BY_LANGUAGE: Record<LanguageCode, {
  familyRoles: RegExp;
  genericDescriptors: RegExp;
  relationshipReferences: RegExp;
}> = {
  // ============= HEBREW =============
  he: {
    // Family roles: אבא, אמא, אח, אחות, סבא, סבתא, דוד, דודה, בן, בת, etc.
    familyRoles: /^(אבא|אמא|אמו|אביה?|אביו|אימא|אימו|אימה|אחי?|אחיו|אחות|אחותו|סבא?|סבו|סבתא?|סבתו|בן|בת|דוד|דודו|דודה|דודתו)(\s+של\s+.+)?$/i,
    
    // Generic descriptors with ה prefix: המנחה, הנער, הגבר, האישה, הילד, etc.
    genericDescriptors: /^(המנחה|המורה|המדריך|הזקן|הזקנה|הנער|הנערה|הבחור|הבחורה|האיש|האישה|החייל|הקוסם|הקוסמת|הילד|הילדה|המלך|המלכה|הנסיך|הנסיכה|השומר|העבד|הסוחר|הכומר|הרופא|הגנב|הלוחם|השוטר|הקדוש|הנביא|הכהן|הפקיד)$/i,
    
    // Relationship references: "אבא של X", "אמו של Y", etc.
    relationshipReferences: /^(אבא|אמא|אמו|אביו|אביה|אימו|אימה|אח|אחי|אחות|סבא|סבו|סבתא|סבתו|בן|בת|דוד|דודו|דודה|דודתו)\s+של\s+/i,
  },

  // ============= ENGLISH =============
  en: {
    // Family roles: father, mother, dad, mom, brother, sister, grandfather, grandmother, son, daughter, uncle, aunt, etc.
    familyRoles: /^(father|mother|dad|mom|dad of|mother of|father of|mom of|son|daughter|brother|sister|grandfather|grandpa|grandmother|grandma|uncle|aunt|nephew|niece|cousin)(\s+of\s+.+)?$/i,
    
    // Generic descriptors: the man, the woman, the boy, the girl, the elder, the wizard, the king, etc.
    genericDescriptors: /^(the\s+(man|woman|boy|girl|child|elder|youth|soldier|wizard|witch|priest|king|queen|prince|princess|scholar|teacher|guide|nurse|doctor|thief|warrior|guard|saint|prophet|merchant|servant|slave|master|lord|lady|knight|peasant|farmer|merchant))$/i,
    
    // Relationship references: "father of X", "mother of Y", etc.
    relationshipReferences: /^(father|mother|dad|mom|son|daughter|brother|sister|grandfather|grandmother|uncle|aunt|nephew|niece|cousin)\s+of\s+/i,
  },

  // ============= PLACEHOLDER FOR FUTURE LANGUAGES =============
  // To add a new language:
  // 1. Add language code to LanguageCode union type
  // 2. Add language patterns here with proper regexes
  // 3. Add location blockWords below
  // 4. Update detectLanguage() function if needed
  
  ar: {
    // Arabic placeholders - to be implemented
    familyRoles: /^(father|mother|brother|sister)$/i,
    genericDescriptors: /^(the\s+\w+)$/i,
    relationshipReferences: /^(father|mother|brother|sister)\s+of\s+/i,
  },
  fr: {
    // French placeholders - to be implemented
    familyRoles: /^(père|mère|frère|sœur)(\s+de\s+.+)?$/i,
    genericDescriptors: /^(l[e']?\s+\w+)$/i,
    relationshipReferences: /^(père|mère|frère|sœur)\s+de\s+/i,
  },
  de: {
    // German placeholders - to be implemented
    familyRoles: /^(vater|mutter|bruder|schwester)(\s+von\s+.+)?$/i,
    genericDescriptors: /^(der|die|das\s+\w+)$/i,
    relationshipReferences: /^(vater|mutter|bruder|schwester)\s+von\s+/i,
  },
  es: {
    // Spanish placeholders - to be implemented
    familyRoles: /^(padre|madre|hermano|hermana)(\s+de\s+.+)?$/i,
    genericDescriptors: /^(el|la|los|las\s+\w+)$/i,
    relationshipReferences: /^(padre|madre|hermano|hermana)\s+de\s+/i,
  },
  it: {
    // Italian placeholders - to be implemented
    familyRoles: /^(padre|madre|fratello|sorella)(\s+di\s+.+)?$/i,
    genericDescriptors: /^(il|la|i|le\s+\w+)$/i,
    relationshipReferences: /^(padre|madre|fratello|sorella)\s+di\s+/i,
  },
  pt: {
    // Portuguese placeholders - to be implemented
    familyRoles: /^(pai|mãe|irmão|irmã)(\s+de\s+.+)?$/i,
    genericDescriptors: /^(o|a|os|as\s+\w+)$/i,
    relationshipReferences: /^(pai|mãe|irmão|irmã)\s+de\s+/i,
  },
  ru: {
    // Russian placeholders - to be implemented
    familyRoles: /^(отец|мать|брат|сестра)(\s+\w+)?$/i,
    genericDescriptors: /^(the\s+\w+)$/i,
    relationshipReferences: /^(отец|мать|брат|сестра)\s+/i,
  },
  ja: {
    // Japanese placeholders - to be implemented
    familyRoles: /^(父|母|兄|姉|弟|妹)$/i,
    genericDescriptors: /^(その|あの\s+\w+)$/i,
    relationshipReferences: /^(父|母|兄|姉|弟|妹)の$/i,
  },
  zh: {
    // Chinese placeholders - to be implemented
    familyRoles: /^(父|母|兄|弟|姐|妹)$/i,
    genericDescriptors: /^(那个|这个\s+\w+)$/i,
    relationshipReferences: /^(父|母|兄|弟|姐|妹)的$/i,
  },
};

/**
 * Location blocking words by language.
 * Each language specifies generic location nouns that should NOT be extracted as entities.
 * 
 * Examples:
 * - Hebrew: חדר (room), יער (forest), עיר (city)
 * - English: room, forest, city, house, street
 */
export const LOCATION_BLOCKWORDS_BY_LANGUAGE: Record<LanguageCode, Set<string>> = {
  // ============= HEBREW =============
  he: new Set([
    // Indoor spaces
    "חדר", "מטבח", "דירה", "סלון", "חצר", "מרתף", "גג", "עליית גג",
    "שירותים", "מסדרון", "מרפסת", "פרוזדור", "מחסן", "אולם", "הול",
    // Outdoor generic
    "אוהל", "גינה", "רחוב", "שדה", "שביל", "כביש", "דרך", "מדרון",
    // Nature generic (without a proper name) - including with ה' הידיעה
    "יער", "היער", "נהר", "הנהר", "הר", "ההר", "גבעה", "הגבעה", "אגם", "האגם", "ים", "הים", "חוף", "החוף", "מערה", "המערה",
    "גשר", "הגשר", "בקעה", "הבקעה", "עמק", "העמק", "מדבר", "המדבר", "מרעה", "ערוץ", "קרקע",
    // Structures generic
    "בית", "בניין", "מגדל", "חומה", "שער", "גדר", "קיר", "תקרה",
    // Urban generic
    "עיר", "כפר", "שוק", "רחבה", "ככר", "מחנה", "מושבה", "קיבוץ",
  ]),

  // ============= ENGLISH =============
  en: new Set([
    // Indoor spaces
    "room", "bedroom", "kitchen", "apartment", "flat", "living room", "lounge",
    "courtyard", "cellar", "basement", "attic", "bathroom", "toilet",
    "hallway", "corridor", "porch", "balcony", "terrace", "storage", "pantry",
    // Outdoor generic
    "tent", "garden", "street", "road", "field", "path", "trail", "way", "slope",
    // Nature generic (without a proper name)
    "forest", "woods", "river", "stream", "mountain", "hill", "lake", "sea", "ocean",
    "beach", "shore", "cave", "cavern", "bridge", "valley", "canyon", "desert", "meadow",
    // Structures generic
    "house", "home", "building", "structure", "tower", "wall", "fence", "gate", "door",
    // Urban generic
    "city", "town", "village", "settlement", "market", "square", "plaza", "camp",
  ]),

  // ============= PLACEHOLDERS FOR FUTURE LANGUAGES =============
  ar: new Set(["house", "city"]), // Arabic - to be implemented
  fr: new Set(["maison", "ville", "chambre", "cuisine", "rue", "route", "forêt", "montagne"]), // French - to be implemented
  de: new Set(["haus", "stadt", "zimmer", "küche", "straße", "wald", "berg", "see"]), // German - to be implemented
  es: new Set(["casa", "ciudad", "habitación", "cocina", "calle", "bosque", "montaña", "mar"]), // Spanish - to be implemented
  it: new Set(["casa", "città", "stanza", "cucina", "strada", "bosco", "montagna", "mare"]), // Italian - to be implemented
  pt: new Set(["casa", "cidade", "quarto", "cozinha", "rua", "floresta", "montanha", "mar"]), // Portuguese - to be implemented
  ru: new Set(["дом", "город", "комната", "кухня", "улица", "лес", "гора", "море"]), // Russian - to be implemented
  ja: new Set(["家", "市", "部屋", "台所", "道", "森", "山", "海"]), // Japanese - to be implemented
  zh: new Set(["房子", "城市", "房间", "厨房", "街道", "森林", "山", "海"]), // Chinese - to be implemented
};

/**
 * Detect the likely language of a given text.
 * Returns the detected language code or 'en' as default.
 * 
 * @param text - The text to analyze
 * @returns Language code (he, en, ar, fr, etc.)
 */
export function detectLanguage(text: string): LanguageCode {
  if (!text) return 'en';

  // Hebrew detection: check for Hebrew letters (U+0590–U+05FF)
  const hebrewCount = (text.match(/[\u0590-\u05FF]/g) || []).length;
  if (hebrewCount > text.length * 0.3) {
    return 'he';
  }

  // Arabic detection: check for Arabic letters (U+0600–U+06FF)
  const arabicCount = (text.match(/[\u0600-\u06FF]/g) || []).length;
  if (arabicCount > text.length * 0.3) {
    return 'ar';
  }

  // Cyrillic detection: check for Cyrillic letters (U+0400–U+04FF)
  const cyrillicCount = (text.match(/[\u0400-\u04FF]/g) || []).length;
  if (cyrillicCount > text.length * 0.3) {
    return 'ru';
  }

  // CJK detection: check for Chinese, Japanese, Korean characters
  // Japanese: Hiragana (U+3040–U+309F) + Katakana (U+30A0–U+30FF)
  // Chinese: CJK Unified Ideographs (U+4E00–U+9FFF)
  // Korean: Hangul (U+AC00–U+D7AF)
  const jpCount = (text.match(/[\u3040-\u309F\u30A0-\u30FF]/g) || []).length;
  if (jpCount > text.length * 0.3) {
    return 'ja';
  }
  
  const cjkCount = (text.match(/[\u4E00-\u9FFF\uAC00-\uD7AF]/g) || []).length;
  if (cjkCount > text.length * 0.3) {
    return 'zh'; // Default to Chinese for other CJK scripts
  }

  // Default to English
  return 'en';
}

/**
 * Get blocking patterns for a specific language.
 * Returns all three blocking patterns (family roles, generic descriptors, relationship references).
 * 
 * @param language - Language code
 * @returns Array of three RegExp patterns for character blocking
 */
export function getCharacterBlockingPatterns(language: LanguageCode): RegExp[] {
  const patterns = CHARACTER_PATTERNS_BY_LANGUAGE[language];
  if (!patterns) {
    console.warn(`Language ${language} not found, using English patterns`);
    return getCharacterBlockingPatterns('en');
  }
  return [patterns.familyRoles, patterns.genericDescriptors, patterns.relationshipReferences];
}

/**
 * Get blocking words for locations in a specific language.
 * 
 * @param language - Language code
 * @returns Set of generic location words
 */
export function getLocationBlockingWords(language: LanguageCode): Set<string> {
  const blockWords = LOCATION_BLOCKWORDS_BY_LANGUAGE[language];
  if (!blockWords) {
    console.warn(`Language ${language} not found, using English block words`);
    return getLocationBlockingWords('en');
  }
  return blockWords;
}

/**
 * Support multiple languages in a single check.
 * Useful for multilingual documents.
 * 
 * @param text - The text to check
 * @param allowedLanguages - Array of allowed language codes (default: ['he', 'en'])
 * @returns Array of blocking patterns from all allowed languages
 */
export function getMultilingualCharacterPatterns(allowedLanguages: LanguageCode[] = ['he', 'en']): RegExp[] {
  const patterns: RegExp[] = [];
  for (const lang of allowedLanguages) {
    patterns.push(...getCharacterBlockingPatterns(lang));
  }
  return patterns;
}

/**
 * Support multiple languages for location blocking words.
 * Useful for multilingual documents.
 * 
 * @param allowedLanguages - Array of allowed language codes (default: ['he', 'en'])
 * @returns Combined Set of blocking words from all allowed languages
 */
export function getMultilingualLocationBlockWords(allowedLanguages: LanguageCode[] = ['he', 'en']): Set<string> {
  const combined = new Set<string>();
  for (const lang of allowedLanguages) {
    const words = getLocationBlockingWords(lang);
    words.forEach(word => combined.add(word));
  }
  return combined;
}
