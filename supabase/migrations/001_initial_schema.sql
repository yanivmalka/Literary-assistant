-- ============================================
-- Fantasy Map Builder - Initial Schema
-- Run this in the Supabase SQL Editor
-- ============================================

-- Enable UUID extension (usually already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PROFILES TABLE
-- Stores user profile information linked to auth.users
-- ============================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  preferred_language TEXT DEFAULT 'en' CHECK (preferred_language IN ('en', 'he')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PROJECTS TABLE
-- Each user can have multiple projects (books/stories)
-- ============================================
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL -- soft delete for trash
);

CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_deleted_at ON projects(deleted_at);

-- ============================================
-- MAPS TABLE
-- Each project can have multiple maps
-- ============================================
CREATE TABLE maps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Map',
  material TEXT NOT NULL DEFAULT 'parchment' CHECK (material IN ('parchment', 'paper', 'aged', 'leather', 'stone')),
  map_type TEXT NOT NULL DEFAULT 'world' CHECK (map_type IN ('world', 'continent', 'country', 'city', 'region')),
  description TEXT, -- free-text description from wizard step 3
  canvas_state JSONB DEFAULT '{}', -- full Konva canvas state
  final_image_url TEXT, -- URL to uploaded final map image in storage
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL -- soft delete for trash
);

CREATE INDEX idx_maps_project_id ON maps(project_id);
CREATE INDEX idx_maps_user_id ON maps(user_id);
CREATE INDEX idx_maps_deleted_at ON maps(deleted_at);

-- ============================================
-- MARKERS TABLE
-- Individual markers placed on maps
-- ============================================
CREATE TABLE markers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  marker_type TEXT NOT NULL CHECK (marker_type IN ('water', 'mountains', 'city', 'capital', 'borders', 'desert', 'forest', 'village', 'custom')),
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  name TEXT, -- place name (null if unnamed or no-name-needed)
  no_name_needed BOOLEAN DEFAULT FALSE,
  region_id UUID, -- links markers that form a region together
  metadata JSONB DEFAULT '{}', -- additional marker-specific data
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_markers_map_id ON markers(map_id);
CREATE INDEX idx_markers_region_id ON markers(region_id);

-- ============================================
-- REGIONS TABLE
-- Groups of markers that form an area (lake, forest, desert, etc.)
-- ============================================
CREATE TABLE regions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  name TEXT,
  region_type TEXT NOT NULL CHECK (region_type IN ('water', 'mountains', 'desert', 'forest', 'custom')),
  inferred_shape TEXT CHECK (inferred_shape IN ('sea', 'lake', 'river', 'mountain_range', 'desert', 'forest', 'custom')),
  no_name_needed BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_regions_map_id ON regions(map_id);

-- Add foreign key from markers.region_id to regions.id
ALTER TABLE markers ADD CONSTRAINT fk_markers_region FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE SET NULL;

-- ============================================
-- MAP_IMAGES TABLE
-- Version history of uploaded final map images
-- ============================================
CREATE TABLE map_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL, -- path in Supabase Storage
  file_name TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  is_current BOOLEAN DEFAULT TRUE, -- marks the currently active version
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_map_images_map_id ON map_images(map_id);

-- ============================================
-- PROMPT_HISTORY TABLE
-- Stores generated prompts for each map
-- ============================================
CREATE TABLE prompt_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  prompt_text TEXT NOT NULL,
  canvas_snapshot JSONB, -- snapshot of canvas state when prompt was generated
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_prompt_history_map_id ON prompt_history(map_id);

-- ============================================
-- UPDATED_AT TRIGGER FUNCTION
-- Automatically updates updated_at on row changes
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER maps_updated_at
  BEFORE UPDATE ON maps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- Trigger that creates a profile when a new user signs up
-- ============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
