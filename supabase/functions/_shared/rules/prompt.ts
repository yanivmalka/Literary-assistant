// ============================================
// Extraction Prompt Builder
// ============================================
// Constructs the Gemini extraction prompt from the centralized rules.
// The prompt is assembled from sections — each section corresponds to
// an entity type's rules. This ensures the prompt always reflects
// the current rule configuration.
// ============================================

/**
 * Build the full extraction prompt for a set of text chunks.
 * This is the single function that produces the LLM instruction.
 * All domain rules are encoded here, derived from the rules files.
 */
export function buildExtractionPrompt(chunks: { position: number; content: string }[]): string {
  const chunksText = chunks
    .map((c) => `[chunk ${c.position}]: ${c.content}`)
    .join("\n\n");

  return `You are a literary entity extractor for Hebrew fiction. Extract meaningful entities from these text chunks.

=== OUTPUT FORMAT ===
Return JSON with these arrays (omit empty arrays):

- characters: [{name, aliases[], age, gender, height, hair_color, eye_color, face_structure, common_clothing, scars, tattoos, description, narrative_role, evidence[], chunk_positions[], field_evidence: {field_name: ["quote supporting this field"], ...}}]
- locations: [{name, aliases[], location_type, parent_location, description, continent, country, region, city, narrative_importance, related_characters, evidence[], chunk_positions[], field_evidence: {field_name: ["quote"], ...}}]
- objects: [{name, aliases[], object_type, description, appearance, materials, special_properties, origin, current_location, owners, narrative_importance, evidence[], chunk_positions[], field_evidence: {field_name: ["quote"], ...}}]
- abilities: [{name, aliases[], ability_type, description, mechanism, activation_conditions, limitations, cost, power_level, users, evidence[], chunk_positions[], field_evidence: {field_name: ["quote"], ...}}]
- magic_abilities: [{name, aliases[], ability_type, description, mechanism, activation_conditions, limitations, cost, power_level, users, evidence[], chunk_positions[], field_evidence: {field_name: ["quote"], ...}}]
- events: [{description, name, participants[], location, what_happened, evidence[], chunk_positions[], field_evidence: {field_name: ["quote"], ...}}]
- relationships: [{character_a, character_b, relationship_type, evidence[], chunk_positions[], field_evidence: {field_name: ["quote"], ...}}]

=== FIELD-SPECIFIC EVIDENCE REQUIREMENT ===
**CRITICAL: For important fields, you MUST provide supporting evidence from the text.**

For each field you extract, if the field is one of these key fields, include the exact quote that supports it in field_evidence:

CHARACTERS - key fields requiring evidence:
- name: The exact textual mention of the character's name
- age: If mentioned (e.g., "בן 18", "בת 25"), include the quote
- gender: If explicitly stated, include the quote
- physical attributes (hair_color, eye_color, height, scars, tattoos): Include the exact description
- narrative_role: The quote showing the character's role or importance
- relationships: Who they're connected to and how

LOCATIONS - key fields:
- name: How the location is named/referenced
- location_type: What type of place it is (city, forest, castle, etc.) with supporting quote
- related_characters: Which characters are mentioned at this location

OBJECTS - key fields:
- name: Exact textual reference
- special_properties: Any magical or unique characteristics with supporting quote
- owners: Who owns/uses the object with quote
- narrative_importance: Why it matters in the story

ABILITIES - key fields:
- name: The ability name as mentioned
- mechanism: How it works, with quote
- power_level: If mentioned, with quote
- users: Who uses it, with quote

Example - CHARACTER with field_evidence:
{
  "name": "ליאו פרוסט",
  "aliases": ["ליאו"],
  "age": 25,
  "hair_color": "שחור",
  "eye_color": "כחול",
  "description": "A brooding sorcerer...",
  "evidence": ["...מחשבותיו על הזעם הקדום..."],
  "chunk_positions": [5, 17, 42],
  "field_evidence": {
    "name": ["אני ליאו פרוסט, הקוסם החקור של אירויין"],
    "age": ["ליאו הציע את יד ימינו לבת עשרים וחמש, זעום אל עצמו שהוא בן חמש ועשרים"],
    "hair_color": ["שערו השחור נפל על עיניו"],
    "eye_color": ["על עיניו הכחולות"],
    "narrative_role": ["ליאו היה הקוסם היחיד שיכול לעצור את קללתה"]
  }
}

=== GENERAL RULES ===
- Return names in Hebrew exactly as written, WITHOUT nikud (vocalization marks).
- Do NOT invent information. Only extract what appears in the text.
- Fields without information = null or omit entirely.
- Keep evidence SHORT (max 10 words each, max 2 per entity).
- field_evidence quotes can be longer (max 15 words) if needed for clarity.
- An alias is NOT a new entity. If the same entity has multiple names/references, use ONE entity with aliases[].
- If you cannot find supporting evidence for a field, do NOT include it in field_evidence (it's optional for fields with null values).

=== CHARACTERS ===

**CRITICAL RULE: ONLY extract characters that have a PROPER NAME (first name, surname, or both).**

NEVER EXTRACT (these WILL be FILTERED OUT):
- Role-based references: אבא, אמא, אמו, אביו, אביה, אימא, אימו, אחי, אחיו, אחות, אחותו, סבא, סבו, סבתא, סבתו, בן, בת, דוד, דודו, דודה, דודתו
- Relationship descriptors: "אמא של הולי", "אביו של הרך", "אחיו של ליאו" (unless the related person is a character entity)
- Generic descriptions (NEVER extract as standalone characters): הנער, הנערה, הבחור, הבחורה, האיש, האישה, הזקן, הזקנה, הקוסם, הקוסמת, החייל, המורה, המדריך, המנחה, המלך, המלכה, הנסיך, הנסיכה, השומר, העבד, הסוחר, הכומר, הרופא, הגנב, הלוחם, הילד, הילדה, השוטר
- ABBREVIATIONS OR INITIALS: ל.ש., א.ב., etc.

DO EXTRACT (characters with proper names):
- "ליאו" — proper first name
- "ליאו פרוסט" — full name (first + surname)
- "אליהו הנביא" — where "אליהו" is the proper name (first name takes priority)
- Any clearly named character, even if they also have a description

NAME CONSOLIDATION:
- If a character appears as "קיל" and also as "קיילאמר", these are the SAME character.
  → canonical name = "קיילאמר" (the longer/fuller name), aliases = ["קיל"]
- If a character appears as "ליאו" and "ליאו סייג'", these are the SAME character.
  → canonical name = "ליאו סייג'" (full name), aliases = ["ליאו"]
- Hebrew nikud differences = same character. "אָרון" = "ארון" → use "ארון" (without nikud)
- **ONLY consolidate if same first name + additional surname, OR within same document/context showing both names for the same entity**
- Never consolidate on family relationship alone (e.g., "ליאו" + "אביו של ליאו" → DO NOT consolidate "אביו" as a character unless it has its own name)

PHYSICAL ATTRIBUTES — pay special attention to: age, height, eye_color, hair_color.
- Extract even when mentioned indirectly:
  "חגג את יום הולדתו השמונה עשרה" → age: "18"
  "שערו השחור נפל על עיניו הכחולות" → hair_color: "שחור", eye_color: "כחול"
- If vague ("גבוה למדי") and cannot be converted to a concrete value → null.

=== LOCATIONS ===

**ONLY extract locations with a DISTINCT IDENTITY and NARRATIVE IMPORTANCE.**

NEVER EXTRACT (these WILL be FILTERED OUT):
- Generic indoor spaces: חדר, מטבח, דירה, סלון, חצר, מרתף, גג, עליית גג, שירותים, מסדרון, מרפסת, פרוזדור, מחסן
- Generic outdoor spaces: שדה, רחוב, שביל, כביש, דרך, גינה, חצר
- Generic nature (without specific name): יער, נהר, הר, גבעה, אגם, ים, חוף, מערה, גשר, בקעה, עמק, מדבר
- Generic buildings/structures: בית, בניין, מגדל, חומה, שער, גדר
- Generic urban: עיר, כפר, שוק, רחבה, ככר

DO EXTRACT (places with distinct identity):
- Named places: "יער אירויין", "המבצר", "טרונהיים", "המישור הארצי", "האקדמיה"
- Places with specific narrative importance
- Unique location identifiers within the story

CONSOLIDATION:
- If "העיר" refers to "טרונהיים" → canonical = "טרונהיים", aliases = ["העיר"]
- If "יער" and "יער אירויין" = same → canonical = "יער אירויין", aliases = ["היער"]
- "המישור הארצי" and "מישור הארצי" = same → use "המישור הארצי" or "מישור הארצי" as canonical (most frequent in text)

=== OBJECTS ===

ONLY extract objects with DISTINCT IDENTITY, NARRATIVE IMPORTANCE, or UNIQUE PROPERTIES.

DO NOT extract:
- Generic furniture/items: שולחן, כיסא, דלת, חלון, מיטה, כוס, צלחת
- Background items without narrative significance

DO extract:
- Named objects: "חרבו של דארקוליאון"
- Objects with special/magical properties or plot significance

=== ABILITIES ===

ONLY extract DISTINCT, SPECIAL abilities — not ordinary actions.

Extract into TWO separate arrays based on ability type:

**abilities[]** — Physical/combat abilities (NOT ordinary actions):
- Exceptional physical feats
- Combat techniques with names
- Special martial skills
- Athletic abilities beyond normal
- Example: "קתיע קרב", "יכולת אתלטית יוצאת דופן"

**magic_abilities[]** — Magical/supernatural abilities:
- Magic powers and spells
- Supernatural abilities
- Mystical techniques
- Example: "רונת אש" (fire magic), "יכולת ראייה דרך קירות" (vision through walls)

DO NOT extract:
- Ordinary actions: running, walking, talking, eating
- General magic system concepts: if term refers to a general system (not a specific usable ability), do NOT extract as entity
- Vague references to "power" without specifics

DO extract:
- Specific named abilities in both categories
- Abilities that characters actively USE
- Distinct techniques with identifiable names

=== CONTEXT AWARENESS ===
- If a word can be either a character name or a concept (e.g., "רונה" could be a person or a type of magic), decide based on context.
- When uncertain, prefer NOT extracting over creating wrong entities.

TEXT:
${chunksText}`;
}

