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
- place_type: The place type, using the catalog below or a precise world-specific label, with supporting quote
- containment: If the text explicitly says the place is inside another place, emit a relationship with type contained_in from the child to the container
- custom_fields: Any named, story-specific location property grounded in the text; preserve the field name in attributes or location_fields
- Do not infer missing levels. A place may be directly inside any other place, and intermediate places may be absent.

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

Extract named or narratively important places, including places that are generic in real life but have a distinct identity in this story. Do not create an entity for an anonymous noun such as "a city" or "the room" unless the text gives it a distinct identity or narrative importance.

PLACE TYPE CATALOG (choose the closest type; do not invent a hierarchy):
- cosmic: universe, parallel_universe, dimension, plane, galaxy, star_system, world, moon
- geography: continent, subcontinent, island, archipelago, peninsula, sea, ocean, lake, river, mountain, mountain_range, desert, forest, natural_region
- governance: country, province, kingdom, colony, empire, territory, principality, duchy, republic, city_state
- settlement: city, capital, town, village, colony_settlement, settlement, farm, fief, trading_post, outpost
- structure: neighborhood, district, street, square, market, harbor, complex, building, villa, fort, castle, palace, temple, place_of_worship, tower
- dwelling: house, cabin, apartment, room, tent, basement, attic, courtyard, garden

For a location, put the selected type in attributes.place_type and include exact support in field_evidence.place_type. If no catalog type is accurate, put the story-specific type in attributes.place_type and preserve it; use "other" only when no meaningful type can be identified.

CONTAINMENT AND STORY-SPECIFIC FIELDS:
- When the text explicitly establishes that one place is inside, part of, under, surrounding, or contained by another place, emit a relationship with type "contained_in" from the child place to the container place.
- Do not require or infer every intermediate level. Examples that are valid: world -> island -> village -> farm; dimension -> plane -> city; world -> continent -> country -> city -> neighborhood -> building.
- Do not put child places into the parent place's fields. A continent tile should show only its containers, if any; it should not show countries or cities merely because they are inside it.
- Preserve story-specific location facts in attributes.location_fields as key/value pairs, with field names grounded in the text. User-defined fields may be unknown to this prompt and must not be discarded.

CONSOLIDATION:
- If "the city" refers to a named city, use the named city as canonical and keep "the city" as an alias.
- Merge spelling/definite-article variants only when the context proves they refer to the same place.

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
1. A top-level entity in the entities array with the ability name and the correct type.
2. The character's name in that ability entity's attributes.users array.

Do not place an ability only inside a character. If the model also returns character.attributes.abilities, character.attributes.life_skills, or character.attributes.magic_abilities, treat those fields as compatibility hints; the top-level ability entity is still mandatory. Always use an array for attributes.users, even for one user. When no user is known, use an empty array.

If the text mentions "בעל יכולת X", "לחימה ב-X", or "טכניקת X", extract X only when the context identifies it as a meaningful ability.

=== CONTEXT AWARENESS ===
- If a word can be either a character name or a concept (e.g., "רונה" could be a person or a type of magic), decide based on context.
- When uncertain, prefer NOT extracting over creating wrong entities.

TEXT:
${chunksText}`;
}



export type ExtractionPromptProfile = "sub-base" | "sub-base-2" | "sub-base-locations";

/**
 * Profile-aware prompt entry point.
 * The shared extraction contract remains identical initially, while each
 * non-base profile has an isolated instruction section that can evolve
 * without changing sub-base. Promotion should transfer reviewed results, not
 * prompt behavior or raw model output automatically.
 */
export function buildExtractionPromptForProfile(
  chunks: { position: number; content: string }[],
  profile: ExtractionPromptProfile,
): string {
  const basePrompt = buildExtractionPrompt(chunks);

  if (profile === "sub-base") {
    return basePrompt;
  }

  const profileLabel = profile === "sub-base-locations" ? "locations" : "sub-base-2"

  return `${basePrompt}

=== ${profileLabel.toUpperCase()} PROFILE INSTRUCTIONS ===
This is the ${profileLabel} extraction profile. Keep the same JSON schema and evidence requirements as the sub-base profile, but this section is intentionally isolated so this profile's extraction instructions can evolve without changing the other profiles.
`;
}
