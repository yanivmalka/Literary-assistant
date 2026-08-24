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
- gender: If explicitly stated OR unambiguously indicated by consistent grammatical pronouns/adjectives/verb forms referring to the named character, include the supporting quote; never infer it from a name, role, appearance, or stereotype
- physical attributes (hair_color, hair_type, eye_color, eye_shape, eye_size, height, scars, tattoos): Include the exact description and keep each supported field separate
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

PHYSICAL ATTRIBUTES — pay special attention to: age, height, gender, eye_color, eye_shape, eye_size, hair_color, hair_type.
- Extract gender from an explicit statement or an unambiguous grammatical signal; do not guess from a name, role, clothing, or stereotype.
- Extract hair_color and hair_type as separate fields whenever both are present. For example, “שיער שחור ארוך וחלק” means hair_color="שחור" and hair_type="ארוך וחלק"; “שיער חום מתולתל” means hair_color="חום" and hair_type="מתולתל".
- Extract eye_color, eye_shape, and eye_size independently whenever each is supported. For example, “עיני שקד חומות” means eye_shape="שקד" and eye_color="חומות"; “עיניים כחולות גדולות” means eye_color="כחולות" and eye_size="גדולות".
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
- "המישור הארצי" and "מישור הארצי" = same → use the most frequent form as canonical

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



export type ExtractionPromptProfile = "sub-base" | "sub-base-2" | "sub-base-locations" | "sub-base-c-characters";

const SUB_BASE_2_PROFILE_INSTRUCTIONS = `=== SUB-BASE-2 PROFILE INSTRUCTIONS ===
This is the sub-base-2 extraction profile. Keep the same JSON schema and evidence requirements as the sub-base profile, but this section is intentionally isolated so this profile's extraction instructions can evolve without changing the other profiles.
`;

const LOCATIONS_PROFILE_INSTRUCTIONS = `=== LOCATION EXTRACTION PROFILE INSTRUCTIONS ===
This profile is a clone of sub-base-2 with additional dynamic place extraction rules. Apply the following rules only to entities whose type is location:

PLACE TYPE CATALOG (choose the closest type; do not impose a fixed hierarchy):
- cosmic: universe, parallel_universe, dimension, plane, galaxy, star_system, world, moon
- geography: continent, subcontinent, island, archipelago, peninsula, sea, ocean, lake, river, mountain, mountain_range, desert, forest, natural_region
- governance: country, province, kingdom, colony, empire, territory, principality, duchy, republic, city_state
- settlement: city, capital, town, village, colony_settlement, settlement, farm, fief, trading_post, outpost
- structure: neighborhood, district, street, square, market, harbor, complex, building, villa, fort, castle, palace, temple, place_of_worship, tower
- dwelling: house, cabin, apartment, room, tent, basement, attic, courtyard, garden

- Put the selected type in attributes.place_type and support it with field_evidence.place_type.
- If no catalog type is accurate, preserve the precise story-specific type in attributes.place_type. Use other only when no meaningful type can be identified.
- When the text explicitly establishes that one place is inside, part of, under, surrounding, or contained by another, emit contained_in from the child place to the container place.
- Do not require or infer intermediate levels. A place may be directly inside any other place.
- Do not put child places into the parent place's fields. A place should expose only its direct containers through relationships.
- Preserve story-specific location facts in attributes.location_fields as grounded key/value pairs. Keep exact user-defined field_key values when they are provided.
- Do not invent location fields or containment when the text provides no evidence.
`;

const CHARACTER_PROFILE_INSTRUCTIONS = `=== SUB-BASE C CHARACTER MODEL A INSTRUCTIONS ===
This is the isolated Sub-base C character-only profile. Extract only named or clearly identifiable characters, their grounded character fields, and relationships between characters.

IDENTITY AND FIELD RULES:
- first_name is mandatory. Do not return a character candidate without a confidently identified first name.
- Keep first_name and last_name separate. Do not put the ordinary first name in aliases.
- aliases may include nicknames, shortened forms, pseudonyms, insults, or humorous names that refer to the same character.
- Extract only populated fields. Never emit null, empty, or guessed values for absent fields.
- You may infer personality, fears, habits, motives, and appearance traits from repeated or strongly supported behavior, but every inferred field must include evidence, confidence, inferred=true, and a short inference_note.
- Explicit facts must still include evidence, confidence, and inferred=false.
- Use the fixed field names supplied by the Model A contract. Project-defined fields may be returned only when listed in the selected project fields section.

SUPPORTED FIXED FIELDS:
first_name, last_name, aliases, age, gender, sexual_orientation, pronouns, occupation, hobbies, favorite_foods, disliked_foods, religion, beliefs, race, height, narrative_role, status, personality_traits, strengths, weaknesses, fears, goals_and_desires, values_and_principles, habits_and_mannerisms, speech_style, secrets, emotional_state, eye_color, eye_shape, eye_size, skin_color, hair_color, hair_type, tattoos, scars, jewelry, body_type, facial_features, distinguishing_features, typical_clothing, posture_and_body_language, appearance_traits.

GENDER AND APPEARANCE EXTRACTION:
- For this C profile, the generic rule that asks for explicit gender is superseded by this rule: extract gender when the text gives an explicit statement OR consistent, unambiguous grammatical evidence such as gendered pronouns, adjectives, or verb forms referring to the named character.
- Do not infer gender from a first name, occupation, appearance, clothing, personality, stereotype, or social role. If the grammatical evidence is ambiguous or inconsistent, omit gender.
- When gender is inferred from grammatical evidence, set inferred=true, include the exact supporting quote in the observation evidence, provide confidence, and add a short inference_note explaining the grammatical signal.
- Extract hair_color and hair_type independently whenever the text supports them. For example, from “שיער שחור ארוך וחלק”, extract hair_color=שחור and hair_type=ארוך וחלק; do not choose only one field and do not merge them in the extraction payload.
- Extract eye_color, eye_shape, and eye_size independently whenever supported. For example, “עיני שקד חומות” may produce eye_shape=שקד and eye_color=חומות; “עיניים כחולות גדולות” may produce eye_color=כחולות and eye_size=גדולות.
- Never guess physical attributes. Direct descriptions and unambiguous grammatical references are valid evidence; names, stereotypes, ethnicity, or visual “impressions” are not.

RELATIONSHIPS:
Use only these relationship_type values: acquaintance, friendship, friendship_deep, family, romantic_relationship, hostility, rivalry, alliance, mentorship, work_subordinate, work_supervisor, protection_or_dependency, no_significant_bond.
- Treat acquaintance, friendship, friendship_deep, family, romantic_relationship, hostility, rivalry, alliance, and no_significant_bond as mutual/symmetric for display: emit one canonical relationship edge, not two duplicate reverse edges.
- Preserve direction for mentorship, work_subordinate, work_supervisor, and protection_or_dependency. The product will display an edge from either character's profile without changing its stored direction.
`;

const DYNAMIC_CHARACTER_FIELD_INSTRUCTIONS = `=== DYNAMIC CHARACTER FIELDS — SUB-BASE-LOCATIONS ONLY ===
For characters in this profile, use attributes.character_fields for the selected project fields listed below.
Keep the exact field_key. Extract a field only when the source explicitly supports it; otherwise omit the key entirely.
Do not create empty or guessed values. Include field_evidence for every populated selected field.

SELECTED CHARACTER FIELDS:
`;

export interface DynamicCharacterFieldPromptDefinition {
  field_key: string;
  label: string;
  group_key: string;
}

export interface ProjectPlaceFieldPromptDefinition {
  place_type_key: string;
  field_key: string;
  label: string;
}

export function buildSubBaseCCharactersInstructions(
  dynamicCharacterFields: DynamicCharacterFieldPromptDefinition[] = [],
): string {
  const sections = [CHARACTER_PROFILE_INSTRUCTIONS, `=== SERIAL EXTRACTION OUTPUT CONTRACT ===
This profile runs as one serial extraction call per chunk window; do not use the parallel-experts contract, artifact fields, role fields, or window metadata.
Return the common schema_version "2" object with an entities array. For every character entity, put first_name, last_name, all populated character fields, and character_field_observations inside attributes.
Each character_field_observations entry must be an array of objects with value, evidence (short exact quotes or objects containing quote and chunk_position), confidence, inferred, and inference_note. Keep the character's entity type equal to "character".
Return character-to-character relationships in the common relationships array using source, target, type, evidence, source_references, and chunk_positions. Do not return a separate characters array or a parallel specialist wrapper.

=== AGE OUTPUT CONTRACT — C ONLY ===
- When the text gives a character's age, return age as one canonical ASCII decimal string only, such as "17". Never return a sentence, noun phrase, location phrase, quotation, or mixed description in age.
- For an unambiguous Hebrew age such as "בת שבע־עשרה", "בת שבע עשרה", or "בת שבע-עשרה", return age="17". Keep the original wording only in that observation's evidence.
- Do not create age from a phrase such as "נערה מהכפר שבע עשרה" or any value containing unrelated description text. If the age is not unambiguous, omit the age value while retaining any exact supporting wording as evidence.
- Keep description independent from age and evidence: never copy description text or an evidence quote into the age value.`];
  if (dynamicCharacterFields.length > 0) {
    sections.push(`=== PROJECT-SPECIFIC CHARACTER FIELDS ===
Return these fields only when the source supports them. Keep the exact field_key and include the same evidence/confidence/inferred metadata as fixed fields.
${dynamicCharacterFields
  .map(field => `- ${field.field_key} (${field.label}; group: ${field.group_key})`)
  .join("\n")}`);
  }
  return sections.join("\n");
}

/**
 * Builds the profile-specific rules that must also be supplied to specialist
 * prompts. Keeping these rules here prevents parallel extraction from drifting
 * away from the sequential extraction contract.
 */
export function buildSubBaseLocationsInstructions(
  customPlaceFields: ProjectPlaceFieldPromptDefinition[] = [],
  dynamicCharacterFields: DynamicCharacterFieldPromptDefinition[] = [],
): string {
  const sections = [LOCATIONS_PROFILE_INSTRUCTIONS];

  if (dynamicCharacterFields.length > 0) {
    sections.push(
      `${DYNAMIC_CHARACTER_FIELD_INSTRUCTIONS}${dynamicCharacterFields
        .map(field => `- ${field.field_key} (${field.label}; group: ${field.group_key})`)
        .join("\n")}`,
    );
  }

  if (customPlaceFields.length > 0) {
    sections.push(`=== PROJECT-SPECIFIC LOCATION FIELDS ===
For a location, use attributes.location_fields for the following user-defined fields when the text explicitly supports them. Keep the exact field_key; do not invent a value. If the field does not apply or has no evidence, omit it.
${customPlaceFields
  .map(field => `- ${field.place_type_key}: ${field.field_key} (${field.label})`)
  .join("\n")}`);
  }

  return sections.join("\n");
}

/**
 * Builds the prompt for the selected extraction profile.
 * sub-base-2 remains the existing development profile; the locations profile
 * is exactly that profile plus isolated location and dynamic-character rules.
 */
export function buildExtractionPromptForProfile(
  chunks: { position: number; content: string }[],
  profile: ExtractionPromptProfile,
  dynamicCharacterFields: DynamicCharacterFieldPromptDefinition[] = [],
  customPlaceFields: ProjectPlaceFieldPromptDefinition[] = [],
): string {
  const basePrompt = buildExtractionPrompt(chunks);

  if (profile === "sub-base") {
    return basePrompt;
  }

  if (profile === "sub-base-c-characters") {
    return `${basePrompt}\n${buildSubBaseCCharactersInstructions(dynamicCharacterFields)}`;
  }

  const subBase2Prompt = `${basePrompt}\n${SUB_BASE_2_PROFILE_INSTRUCTIONS}`;
  if (profile === "sub-base-2") {
    return subBase2Prompt;
  }

  return `${subBase2Prompt}\n${buildSubBaseLocationsInstructions(customPlaceFields, dynamicCharacterFields)}`;
}
