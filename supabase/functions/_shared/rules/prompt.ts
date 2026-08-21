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
Return exactly one JSON object and nothing else. Do not return Markdown, code fences, commentary, or a second object.
Use schema_version "2" and one unified entities array. Omit empty arrays, but always include entities, relationships, and events.

{
  "schema_version": "2",
  "entities": [
    {
      "name": "exact name from the text",
      "type": "character | location | object | ability | magic_ability | organization",
      "description": "short description grounded in the text",
      "aliases": [],
      "attributes": {},
      "name_uncertainty": {
        "is_uncertain": false,
        "confidence": 0.0,
        "reason": null
      },
      "evidence": [],
      "source_references": [
        {
          "chunk_position": 0,
          "quote": "short exact quote supporting the extraction",
          "position_start": null,
          "position_end": null
        }
      ],
      "chunk_positions": [],
      "field_evidence": { "field_name": ["exact supporting quote"] }
    }
  ],
  "relationships": [
    {
      "source": { "name": "entity name", "type": "character" },
      "target": { "name": "entity name", "type": "location" },
      "type": "located_in",
      "description": "short grounded explanation",
      "evidence": [],
      "source_references": [],
      "chunk_positions": []
    }
  ],
  "events": [
    {
      "name": "short event name",
      "description": "what happened",
      "participants": [{ "name": "entity name", "type": "character" }],
      "location": { "name": "location name", "type": "location" },
      "evidence": [],
      "source_references": [],
      "chunk_positions": []
    }
  ]
}

Every entity MUST have a non-empty name and type. Every relationship MUST have source, target, and type. Every event MUST have name or description. Use name_uncertainty when a nickname, title, or partial name may not be the canonical identity; do not invent a full name. Confidence is a number from 0 to 1 and represents model certainty, not a fact from the text.

The persistence layer also accepts the older characters/locations/objects/abilities/magic_abilities format for backward compatibility, but you must emit the schema above.

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

Extract every meaningful ability as a first-class entity. Use the field "type" with value "ability" for physical, combat, practical, or life skills and value "magic_ability" for magical or supernatural abilities.

Physical/life-skill examples:
- "קריאת שפתיים"
- "לחימה בשתי חרבות"
- "ריפוי אנרגטי"

Magical examples:
- "טלקינזיס"
- "רונת אש"

When an ability is mentioned as belonging to a character, emit BOTH:
1. A top-level entity in `entities` with the ability name and the correct type.
2. The character's name in that ability entity's `attributes.users` array.

Do not place an ability only inside a character. If the model also returns `character.attributes.abilities`, `character.attributes.life_skills`, or `character.attributes.magic_abilities`, treat those fields as compatibility hints; the top-level ability entity is still mandatory. Always use an array for `attributes.users`, even for one user. When no user is known, use an empty array.

If the text mentions "בעל יכולת X", "לחימה ב-X", or "טכניקת X", extract X only when the context identifies it as a meaningful ability.

=== CONTEXT AWARENESS ===
- If a word can be either a character name or a concept (e.g., "רונה" could be a person or a type of magic), decide based on context.
- When uncertain, prefer NOT extracting over creating wrong entities.

TEXT:
${chunksText}`;
}



export type ExtractionPromptProfile = "current" | "development";

/**
 * Profile-aware prompt entry point.
 * The shared extraction contract remains identical initially, while the
 * development profile has an isolated instruction section that can evolve
 * without changing current. Promotion should transfer reviewed results, not
 * prompt behavior or raw model output automatically.
 */
export function buildExtractionPromptForProfile(
  chunks: { position: number; content: string }[],
  profile: ExtractionPromptProfile,
): string {
  const basePrompt = buildExtractionPrompt(chunks);

  if (profile === "current") {
    return basePrompt;
  }

  return `${basePrompt}

=== DEVELOPMENT PROFILE INSTRUCTIONS ===
This is the development extraction profile. Keep the same JSON schema and evidence requirements as the active profile, but this section is intentionally isolated so development-specific extraction instructions can evolve without changing the active profile.
`;
}
