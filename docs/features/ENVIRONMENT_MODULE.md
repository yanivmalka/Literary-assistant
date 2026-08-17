# Environment Module - Feature Planning

## Overview
Module for managing location/environment profiles. The system analyzes the uploaded manuscript to automatically identify the 5 most dominant locations and create profiles for them.

## Core Features (Free Tier)

### Automatic Location Extraction
- System analyzes uploaded manuscript (PDF/DOCS)
- Identifies the 5 most dominant/frequently mentioned locations
- Automatically creates environment profiles for these locations
- Locations can be: continents, cities, countries, houses, rooms, etc.

### Environment Profile
Each profile includes:
- Location name
- Description of the place
- Impact on characters throughout the plot
- Geographic context (city/country/continent)
- AI-generated image of the location

### Profile Editing
- User can rewrite descriptions, character impacts, and other parameters
- Can add precise location if not mentioned in the text
- If edited description diverges from the current profile image → system generates new image matching updated description

### Keyword-Based Profile Creation
- User can enter a keyword or phrase
- System focuses on that specific location in the manuscript
- Creates a profile automatically based on text analysis

## Premium Features

### Profile Folders
- User can organize locations into hierarchical folders by region
- Example: Continent A folder → Country 1 folder → specific locations
- Two continents, three countries each → folder per continent, sub-folder per country
- Within each country: location profiles (houses, specific areas)
- Based on description or extracted from source material

## Technical Notes

### Database Schema Additions
```sql
CREATE TABLE environments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  character_impact TEXT,
  geographic_context TEXT, -- city/country/continent hierarchy
  parent_environment_id UUID REFERENCES environments(id) ON DELETE SET NULL,
  image_url TEXT,
  keywords TEXT[], -- keywords that link to this location in the text
  dominance_score FLOAT, -- how prominent this location is in the story
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL
);

CREATE TABLE environment_folders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_folder_id UUID REFERENCES environment_folders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### AI Integration
- Text analysis: NLP to extract location mentions, frequency, descriptions
- Image generation: prompt-based (same approach as maps/characters)
- Change detection: compare old vs new description to decide if image regeneration is needed

### UI Components Needed
- `EnvironmentProfile.tsx` - location profile card
- `EnvironmentList.tsx` - list of extracted locations
- `EnvironmentEditor.tsx` - edit profile details
- `FolderTree.tsx` - hierarchical folder navigation (premium)
- `KeywordSearch.tsx` - search/create by keyword

## Dependencies on Other Modules
- Links to Maps module (locations on the map ↔ environment profiles)
- Links to Characters module (character impact tracking)
- Requires manuscript upload (shared with Characters module)

## Priority: MEDIUM
Build after Characters module. Shares manuscript analysis infrastructure.
