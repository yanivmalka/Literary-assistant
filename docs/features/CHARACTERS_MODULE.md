# Characters Module - Feature Planning

## Overview
Module for managing character profiles, generating character portraits via AI, and detecting description inconsistencies across the manuscript.

## Core Features (Free Tier)

### Character Profile Creation
- Click "Add Character" button → opens questionnaire form
- Required fields:
  - Name, Age, Gender
  - Hair color, Eye color, Height
  - General facial structure (cheekbones, eye shape, forehead, nose, beard/mustache for males)
  - Common clothing items
  - External markers (jewelry, scars, tattoos)
- Image style selection (predefined): realistic, watercolor, oil paint, anime, children's drawing, etc.
- AI generates a profile portrait based on the filled fields
- Profile card displayed in project folder

### Description Consistency Checker
- User uploads story file (PDF or DOCS link) to the project folder
- System reads the file and cross-references against existing character profiles
- Generates a document listing description errors/inconsistencies
- If no errors found, system states so
- When new profiles are created, system re-scans the file and updates the error document

### AI Prompt for Character Portrait
- Same approach as maps: generate a detailed text prompt from the profile fields
- User can copy prompt to external AI tools (Midjourney, DALL-E, etc.)
- Upload the result back as the profile portrait

## Premium Features

### Age Progression Timeline
- Up to 10 different age stages across character's growth
- Track external changes over the story (hair color, glasses, contacts, tattoos, jewelry, new scars)
- Generate portraits for each age stage

### Character Image Gallery
- Create a folder of character images based on the profile description
- Profile portrait serves as reference image (img2img guidance)
- Multiple poses, scenes, expressions

### Character Cross-Reference
- Generate images of one character with other characters
- Based on both profiles existing in the same project folder
- Useful for cover art, scene illustrations

## Technical Notes

### Database Schema Additions
```sql
CREATE TABLE characters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  age INTEGER,
  gender TEXT,
  hair_color TEXT,
  eye_color TEXT,
  height TEXT,
  facial_description TEXT,
  clothing TEXT,
  external_markers TEXT,
  image_style TEXT DEFAULT 'realistic',
  profile_image_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL
);

CREATE TABLE character_age_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  age INTEGER NOT NULL,
  description_changes TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE description_errors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
  error_text TEXT NOT NULL,
  source_location TEXT, -- page/paragraph reference
  severity TEXT DEFAULT 'warning',
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### AI Integration
- Portrait generation: same prompt-based approach as maps
- Consistency checking: parse uploaded document → extract character descriptions → compare against profile fields
- LLM needed for: extracting character descriptions from text, identifying contradictions

### UI Components Needed
- `CharacterForm.tsx` - questionnaire form
- `CharacterCard.tsx` - profile display card
- `CharacterGallery.tsx` - image gallery view
- `ConsistencyReport.tsx` - error list display
- `AgeTimeline.tsx` - timeline visualization (premium)

## Dependencies on Other Modules
- Uses project folder system (already built)
- Can cross-reference with Environment module (character + location)
- Can cross-reference with Magic module (character + abilities)

## Priority: HIGH
This is the next module to build after Maps MVP is stable.
