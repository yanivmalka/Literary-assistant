// ============================================
// Location Rules
// ============================================
// Defines what constitutes a valid location entity.
// Only locations with distinct identity and narrative importance are extracted.
// ============================================

export const LOCATION_RULES = {
  /**
   * Core rule: Only locations with a DISTINCT IDENTITY are extracted.
   * A distinct identity means the location has a unique name, recurring
   * narrative presence, or specific importance to the plot.
   */
  requiresDistinctIdentity: true,

  /**
   * Generic location nouns that should NOT become entities on their own.
   * These are only valid if paired with a unique identifier
   * (e.g., "חדר" = blocked, "חדרו של ליאו" = might be valid if narratively important).
   * 
   * TO ADD A BLOCKWORD: Simply add it to this set. No other changes needed.
   * 
   * Includes:
   * - Indoor spaces: חדר, מטבח, דירה, סלון, חצר, מרתף, גג, עליית גג, שירותים, מסדרון, מרפסת, פרוזדור, מחסן
   * - Outdoor generic: אוהל, גינה, רחוב, שדה, שביל, כביש, דרך
   * - Nature generic (without name): יער, נהר, הר, גבעה, אגם, ים, חוף, מערה, גשר, בקעה, עמק, מדבר
   * - Structures generic: בית, בניין, מגדל, חומה, שער, גדר
   * - Urban generic: עיר, כפר, שוק, רחבה, ככר
   */
  blockWords: new Set([
    // Indoor spaces
    "חדר", "מטבח", "דירה", "סלון", "חצר", "מרתף", "גג", "עליית גג",
    "שירותים", "מסדרון", "מרפסת", "פרוזדור", "מחסן",
    // Outdoor generic
    "אוהל", "גינה", "רחוב", "שדה", "שביל", "כביש", "דרך",
    // Nature generic (without a proper name)
    "יער", "נהר", "הר", "גבעה", "אגם", "ים", "חוף", "מערה",
    "גשר", "בקעה", "עמק", "מדבר",
    // Structures generic
    "בית", "בניין", "מגדל", "חומה", "שער", "גדר",
    // Urban generic
    "עיר", "כפר", "שוק", "רחבה", "ככר",
  ]),

  /**
   * Location types that the system recognizes.
   */
  validTypes: [
    'continent', 'country', 'region', 'city', 'village',
    'building', 'room', 'landmark', 'wilderness', 'other',
  ] as const,

  /**
   * Consolidation rules for locations:
   * - "העיר" referring to "טרונהיים" → canonical: "טרונהיים", alias: "העיר"
   * - "יער" + "יער אירויין" = same → canonical: "יער אירויין", alias: "היער"
   * - "המישור הארצי" and "מישור הארצי" = same → pick the most natural form
   */
  consolidation: {
    preferSpecificName: true,
    treatHeHayediaAsIdentical: true,
    treatNikudAsIdentical: true,
  },

  /**
   * All structured fields for a location.
   */
  fields: [
    'name', 'location_type', 'parent_location', 'description',
    'continent', 'country', 'region', 'city',
    'narrative_impact', 'narrative_importance', 'related_events', 'related_characters',
  ] as const,
} as const;

