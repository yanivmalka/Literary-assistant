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

- characters: [{name, aliases[], age, gender, height, hair_color, eye_color, face_structure, common_clothing, scars, tattoos, description, narrative_role, evidence[], chunk_positions[]}]
- locations: [{name, aliases[], location_type, parent_location, description, continent, country, region, city, narrative_importance, related_characters, evidence[], chunk_positions[]}]
- objects: [{name, aliases[], object_type, description, appearance, materials, special_properties, origin, current_location, owners, narrative_importance, evidence[], chunk_positions[]}]
- abilities: [{name, aliases[], ability_type, description, mechanism, activation_conditions, limitations, cost, power_level, users, evidence[], chunk_positions[]}]
- events: [{description, name, participants[], location, what_happened, evidence[], chunk_positions[]}]
- relationships: [{character_a, character_b, relationship_type, evidence[], chunk_positions[]}]

=== GENERAL RULES ===
- Return names in Hebrew exactly as written, WITHOUT nikud (vocalization marks).
- Do NOT invent information. Only extract what appears in the text.
- Fields without information = null or omit entirely.
- Keep evidence SHORT (max 10 words each, max 2 per entity).
- An alias is NOT a new entity. If the same entity has multiple names/references, use ONE entity with aliases[].

=== CHARACTERS ===
ONLY extract characters that have a PROPER NAME (first name, surname, or both).

DO NOT extract:
- Role-based references: אבא, אמא, סבא, סבתא, אח, אחות, דוד, דודה
- Generic descriptions: הנער, האיש, האישה, הזקן, הקוסם, החייל, המורה, המנחה
- Relationship references: "אביה של רייבן", "אמא של הולי"

DO extract:
- "ליאו" — proper first name
- "ליאו פרוסט" — full name

NAME CONSOLIDATION:
- If a character appears as "קיל" and also as "קיילאמר", these are the SAME character.
  → canonical name = "קיילאמר" (the longer/fuller name), aliases = ["קיל"]
- If a character appears as "ליאו" and "ליאו סייג'", these are the SAME character.
  → canonical name = "ליאו סייג'" (full name), aliases = ["ליאו"]
- Hebrew nikud differences = same character. "אָרון" = "ארון" → use "ארון" (without nikud).

PHYSICAL ATTRIBUTES — pay special attention to: age, height, eye_color, hair_color.
- Extract even when mentioned indirectly:
  "חגג את יום הולדתו השמונה עשרה" → age: "18"
  "שערו השחור נפל על עיניו הכחולות" → hair_color: "שחור", eye_color: "כחול"
- If vague ("גבוה למדי") and cannot be converted to a concrete value → null.

=== LOCATIONS ===
ONLY extract locations with a DISTINCT IDENTITY and NARRATIVE IMPORTANCE.

DO NOT extract:
- Generic nouns: חדר, מטבח, דירה, אוהל, גינה, בית, סלון, רחוב, יער (ללא שם), עיר (ללא זיהוי)

DO extract:
- Named places: "יער אירויין", "המבצר", "טרונהיים", "המישור הארצי", "האקדמיה"
- Places with distinct narrative identity

CONSOLIDATION:
- If "העיר" refers to "טרונהיים" → canonical = "טרונהיים", aliases = ["העיר"]
- If "יער" and "יער אירויין" refer to the same place → canonical = "יער אירויין", aliases = ["היער"]
- "המישור הארצי" and "מישור הארצי" = same place → use the most common full form
- Use names WITHOUT nikud.

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

ability_type field MUST be one of:
- "physical" — exceptional physical/combat abilities, special techniques (NOT ordinary actions)
- "magical" — magical powers, spells, supernatural abilities

DO NOT extract:
- Ordinary actions: running, walking, talking, eating
- General magic system concepts: if a term refers to a general system (not a specific usable ability), do NOT extract
- Vague references to "power" without specifics

DO extract:
- Specific named abilities: "רונת אש", "יכולת ראייה דרך קירות"
- Distinct combat techniques with names
- Specific magical powers that characters actively USE

=== CONTEXT AWARENESS ===
- If a word can be either a character name or a concept (e.g., "רונה" could be a person or a type of magic), decide based on context.
- When uncertain, prefer NOT extracting over creating wrong entities.

TEXT:
${chunksText}`;
}
