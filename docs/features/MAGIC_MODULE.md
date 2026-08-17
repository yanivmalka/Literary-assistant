# Magic & Abilities Module - Feature Planning

## Overview
Module for documenting and analyzing magic systems. The system analyzes the manuscript to understand magic rules, creates ability profiles, links them to characters and environments, and identifies logical holes in the magic system.

## Core Features

### Magic System Analysis
- User requests analysis of the magic system as it appears in the story
- System parses the manuscript and identifies:
  - Types of magic/abilities mentioned
  - Rules and limitations
  - Who uses what
  - Where abilities are used
  - Logical inconsistencies or gaps

### Magic Profiles
- Auto-generated profiles for each type of magic/ability
- Linked to character profiles (who has this ability)
- Linked to environment profiles (where it was used)
- AI-generated images showing the character using the ability in the relevant location
- Based on character reference image + environment + ability description

### Automatic Folder Organization
- System autonomously organizes abilities into type folders
- Based on the logical structure found in the text
- Example: Elemental Magic → Fire / Water / Earth / Air sub-folders

### User Reorganization
- User can rearrange abilities if the system organized incorrectly
- Drag & drop folder/ability reorganization
- Rename categories

## Technical Notes

### Database Schema Additions
```sql
CREATE TABLE magic_systems (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  rules TEXT,
  limitations TEXT,
  logical_gaps TEXT, -- identified inconsistencies
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE abilities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  magic_system_id UUID NOT NULL REFERENCES magic_systems(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  type_category TEXT, -- folder/category name
  effects TEXT,
  limitations TEXT,
  image_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE character_abilities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  ability_id UUID NOT NULL REFERENCES abilities(id) ON DELETE CASCADE,
  proficiency_level TEXT,
  first_appearance TEXT, -- where in the story this was first shown
  usage_images TEXT[], -- URLs to generated usage images
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ability_folders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  magic_system_id UUID REFERENCES magic_systems(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_folder_id UUID REFERENCES ability_folders(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### AI Integration
- Deep text analysis: identify magic rules, causality, and logical consistency
- Cross-reference: character + environment + ability → generate contextual images
- Gap detection: find contradictions in how magic works across different scenes

### UI Components Needed
- `MagicSystemOverview.tsx` - high-level view of the magic system
- `AbilityCard.tsx` - individual ability profile
- `AbilityTree.tsx` - folder/category tree view with drag & drop
- `GapAnalysis.tsx` - display of logical holes found
- `CharacterAbilityLink.tsx` - show which characters have which abilities
- `UsageGallery.tsx` - images of ability usage in context

## Dependencies on Other Modules
- Requires Characters module (character-ability linking)
- Requires Environment module (location-based usage images)
- Requires manuscript upload (shared infrastructure)
- Links to Maps module (mark locations where magic was used)

## Priority: LOW
Build last. Requires both Characters and Environment modules to be functional for full cross-referencing.
