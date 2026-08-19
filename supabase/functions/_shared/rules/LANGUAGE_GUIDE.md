# Multi-Language Support Guide

## Overview

The entity extraction system supports multiple languages through a scalable, centralized rule system. Currently supported:

- **Hebrew** (he) - Fully implemented
- **English** (en) - Fully implemented
- **Arabic** (ar) - Placeholder
- **French** (fr) - Placeholder
- **German** (de) - Placeholder
- **Spanish** (es) - Placeholder
- **Italian** (it) - Placeholder
- **Portuguese** (pt) - Placeholder
- **Russian** (ru) - Placeholder
- **Japanese** (ja) - Placeholder
- **Chinese** (zh) - Placeholder

## How It Works

### 1. Language Detection (`language-rules.ts`)

The system auto-detects language by analyzing character codes:

```
Input Text → Character Analysis → Language Code (he/en/ar/ru/ja/zh/etc.)
```

**Detection Rules:**
- Hebrew: 30%+ characters in U+0590–U+05FF range
- Arabic: 30%+ characters in U+0600–U+06FF range
- Russian (Cyrillic): 30%+ characters in U+0400–U+04FF range
- Japanese: 30%+ Hiragana (U+3040–U+309F) or Katakana (U+30A0–U+30FF)
- Chinese: 30%+ CJK Ideographs (U+4E00–U+9FFF)
- English: Default fallback

### 2. Character Blocking (`characters.ts`)

For each language, define **3 regex patterns**:

1. **Family Roles** - Family relationships (father, mother, brother, sister, etc.)
2. **Generic Descriptors** - Role/profession descriptors (the man, the wizard, המנחה, etc.)
3. **Relationship References** - "X of Y" or "X של Y" style relationships

### 3. Location Blocking (`locations.ts`)

For each language, define a **Set of block words**:

- Indoor spaces (room, kitchen, bedroom, chamber, etc.)
- Outdoor generic (street, road, field, path, etc.)
- Nature generic (forest, river, mountain, desert, etc.)
- Structures (house, building, tower, wall, etc.)
- Urban areas (city, town, village, market, square, etc.)

## Adding a New Language

### Step 1: Define Character Blocking Patterns

Edit `supabase/functions/_shared/rules/language-rules.ts`:

```typescript
// In CHARACTER_PATTERNS_BY_LANGUAGE object, add your language:

es: {  // Spanish example
  // Family roles: padre, madre, hermano, hermana, etc.
  familyRoles: /^(padre|madre|hermano|hermana|abuelo|abuela|tío|tía|hijo|hija)(\s+de\s+.+)?$/i,
  
  // Generic descriptors: el hombre, la mujer, el mago, etc.
  genericDescriptors: /^(el\s+(hombre|mujer|niño|niña|mago|rey|guerrero)|la\s+(mujer|niña|bruja|reina|guerrera))$/i,
  
  // Relationship references: "padre de X", "hermano de Y", etc.
  relationshipReferences: /^(padre|madre|hermano|hermana|abuelo|abuela|tío|tía|hijo|hija)\s+de\s+/i,
}
```

**Tips for Regex Patterns:**

- Use `^...$` to match the entire string (whole phrase only)
- Use `(?:...)` for non-capturing groups
- Use `|` for alternatives (option1|option2|option3)
- Case-insensitive: add `i` flag at the end
- Optional suffix: use `(\s+of\s+.+)?` or `(\s+de\s+.+)?`
- Account for different word orders (some languages use "role של name", others "role de name")

### Step 2: Define Location Block Words

Edit `supabase/functions/_shared/rules/language-rules.ts`:

```typescript
// In LOCATION_BLOCKWORDS_BY_LANGUAGE object, add your language:

es: new Set([
  // Indoor spaces
  "habitación", "sala", "cocina", "dormitorio", "baño", "salón", "sótano", "ático", "pasillo", "jardín",
  // Outdoor generic
  "calle", "camino", "sendero", "carretera", "ruta", "tienda", "prado",
  // Nature generic (without a proper name)
  "bosque", "río", "montaña", "colina", "lago", "mar", "océano", "playa", "costa", "cueva", "gruta",
  "puente", "valle", "cañón", "desierto", "pradera", "prado",
  // Structures generic
  "casa", "edificio", "torre", "muro", "muralla", "puerta", "valla", "cerca", "pared", "techo",
  // Urban generic
  "ciudad", "pueblo", "villa", "mercado", "plaza", "campamento", "colonia", "asentamiento",
]),
```

**Tips for Block Words:**

- Include both singular and plural forms if different
- Include both definite and indefinite articles (le, la, les, los, la, las, etc.)
- Include word with and without articles when they differ significantly
- Think of common contexts: "a room", "the room", "room" — how do they appear in text?
- For languages with gender, include both forms: "un château" (masculine), "une maison" (feminine)

### Step 3: Update Language Detection (if needed)

If your language uses Unicode characters not covered by existing detection, add to `detectLanguage()` function:

```typescript
// Example: Thai detection (U+0E00–U+0E7F)
const thaiCount = (text.match(/[\u0E00-\u0E7F]/g) || []).length;
if (thaiCount > text.length * 0.3) {
  return 'th';
}
```

### Step 4: Test Your Language

Create a simple test to verify filtering works:

```typescript
import { getCharacterBlockingPatterns, getLocationBlockingWords } from '../_shared/rules/language-rules.ts';

const characterPatterns = getCharacterBlockingPatterns('es');
const locationWords = getLocationBlockingWords('es');

// Test character blocking
console.log(characterPatterns[0].test('padre')); // should be true
console.log(characterPatterns[0].test('Diego')); // should be false

// Test location blocking
console.log(locationWords.has('habitación')); // should be true
console.log(locationWords.has('Madrid')); // should be false
```

## Usage in Extraction

Once a language is defined in `language-rules.ts`, the extraction system **automatically uses it**:

### 1. Character Filtering

When extracting a character with name "Diego":

```
1. Detect language: "Diego" → English (default)
2. Get EN character patterns
3. Check: Does "Diego" match familyRoles pattern? No
4. Check: Does "Diego" match genericDescriptors pattern? No
5. Result: KEPT (valid entity)
```

### 2. Location Filtering

When extracting a location named "bosque":

```
1. Detect language: "bosque" → Spanish
2. Get ES location block words
3. Check: Is "bosque" in blockWords set? Yes
4. Result: FILTERED (generic word, not a proper location)
```

### 3. Multilingual Documents

If a document mixes Hebrew and English:

```typescript
// In extraction code:
const detectedLanguage = detectLanguage(name); // Auto-detects for each entity
const patterns = getCharacterBlockingPatterns(detectedLanguage);
// Each entity is filtered based on its own detected language
```

## Best Practices

1. **Test comprehensively**: Include edge cases (possessives, plural forms, articles)
2. **Keep patterns simple**: Complex regexes are hard to maintain and debug
3. **Document assumptions**: Add comments explaining why certain terms are blocked
4. **Consider false positives vs false negatives**:
   - False Positive (too strict): "María" filtered as "mother" → Bad
   - False Negative (too loose): "father" extracted as a character → Not ideal but safer
5. **Reuse language structures**: Similar languages (Spanish/Portuguese, Czech/Polish) can share many patterns
6. **Test with real texts**: Use actual books/stories in your language, not just isolated test cases

## Examples

### Hebrew Example (Complete)

```typescript
he: {
  familyRoles: /^(אבא|אמא|אמו|אביה?|אביו|אימא|אימו|אימה|אחי?|אחיו|אחות|אחותו|סבא?|סבו|סבתא?|סבתו|בן|בת|דוד|דודו|דודה|דודתו)(\s+של\s+.+)?$/i,
  genericDescriptors: /^(המנחה|המורה|המדריך|הזקן|הנער|הבחור|האיש|החייל|הקוסם|הילד|המלך|הנסיך|הכהן)$/i,
  relationshipReferences: /^(אבא|אמא|אח|אחות|סבא|סבתא|בן|בת|דוד|דודה)\s+של\s+/i,
}
```

### English Example (Complete)

```typescript
en: {
  familyRoles: /^(father|mother|dad|mom|son|daughter|brother|sister|grandfather|grandmother|uncle|aunt|nephew|niece|cousin)(\s+of\s+.+)?$/i,
  genericDescriptors: /^(the\s+(man|woman|boy|girl|child|elder|wizard|king|queen|prince|princess|knight|peasant))$/i,
  relationshipReferences: /^(father|mother|dad|mom|son|daughter|brother|sister|grandfather|grandmother|uncle|aunt)\s+of\s+/i,
}
```

## Future Enhancements

1. **Context-aware detection**: Detect language separately for each entity/chunk (not just entire document)
2. **Dialect support**: Portuguese (PT vs BR), Spanish (ES vs MX), Chinese (Simplified vs Traditional)
3. **Synonym expansion**: "dad" ↔ "father", "papa" ↔ "papá"
4. **Custom rule sets per project**: Allow users to define language-specific rules for their domain
5. **ML-based detection**: Use character n-grams for more accurate language detection

## Support

For questions or to contribute a new language, see the project's contribution guidelines.
