# Full Character and Location Extraction Fixture

This controlled fixture is designed to verify every active structured field for one character and one location.

The names and values below are intentionally explicit and repeated so the extraction result can be compared against an exact expected matrix.

## Part 1 — Character profile

Mira Stonewell is a 31-year-old woman. She is 5 feet 8 inches tall. Mira has black hair and green eyes. Her face structure is oval, with high cheekbones. Her eyes are almond-shaped. Her forehead is broad. Her nose is straight. She has no beard or mustache. Mira usually wears a dark-blue wool coat and leather boots. She wears a silver moon pendant and a thin copper ring as jewelry. A narrow scar crosses her left eyebrow. A small crescent tattoo is visible on her right wrist. Other visual features include a small birthmark below her left ear.

Mira Stonewell is a reluctant guardian and investigator. Her description is that she is observant, patient, and protective of people who cannot defend themselves. Her narrative role is reluctant guardian. Her narrative impact is that her decision to protect the forbidden archive drives the central conflict of the story.

## Part 2 — Character repetition and alias

The investigator Mira is also called Mira Stonewell by the archivists. She is the same woman: thirty-one years old, five feet eight inches tall, with black hair, green almond-shaped eyes, an oval face, high cheekbones, a broad forehead, and a straight nose. She wears the dark-blue wool coat and silver moon pendant. The scar over her left eyebrow and the crescent tattoo on her right wrist identify her.

## Part 3 — Location profile

Asterfall Citadel is a fortress. Its description is that it is a walled stone citadel built around a circular archive tower. Asterfall Citadel is on the continent of Aurelia, in the country of Lyr, in the North March region, and its city is Valebridge. Its narrative impact is that the citadel is the place where the archive conflict begins. Its narrative importance is critical because control of Asterfall determines access to the kingdom's oldest records.

## Part 4 — Location repetition and hierarchy context

The fortress Asterfall Citadel, also called Asterfall, stands in Valebridge in the North March of Lyr on Aurelia. The same location is the central setting for the opening chapters. Mira enters Asterfall Citadel to protect the forbidden archive.

## Expected extraction targets

The extraction must produce one character entity named `Mira Stonewell` and one location entity named `Asterfall Citadel`. The expected values for every active CharacterFields and LocationFields field are defined in `supabase/sql/verification/VERIFY_CHARACTER_LOCATION_FIELDS.sql`.

Values that are not part of the active LocationFields model, such as `parent_location`, `related_events`, and `related_characters`, are not acceptance criteria for this fixture; relationships should be verified through the relationship model instead.
