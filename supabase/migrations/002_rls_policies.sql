-- ============================================
-- Row Level Security Policies
-- Run this in the Supabase SQL Editor AFTER 001_initial_schema.sql
-- ============================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE markers ENABLE ROW LEVEL SECURITY;
ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE map_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_history ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PROFILES POLICIES
-- ============================================
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- ============================================
-- PROJECTS POLICIES
-- ============================================
CREATE POLICY "Users can view their own projects"
  ON projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects"
  ON projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects"
  ON projects FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- MAPS POLICIES
-- ============================================
CREATE POLICY "Users can view their own maps"
  ON maps FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own maps"
  ON maps FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own maps"
  ON maps FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own maps"
  ON maps FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- MARKERS POLICIES (via map ownership)
-- ============================================
CREATE POLICY "Users can view markers on their maps"
  ON markers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM maps WHERE maps.id = markers.map_id AND maps.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create markers on their maps"
  ON markers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM maps WHERE maps.id = markers.map_id AND maps.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update markers on their maps"
  ON markers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM maps WHERE maps.id = markers.map_id AND maps.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete markers on their maps"
  ON markers FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM maps WHERE maps.id = markers.map_id AND maps.user_id = auth.uid()
    )
  );

-- ============================================
-- REGIONS POLICIES (via map ownership)
-- ============================================
CREATE POLICY "Users can view regions on their maps"
  ON regions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM maps WHERE maps.id = regions.map_id AND maps.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create regions on their maps"
  ON regions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM maps WHERE maps.id = regions.map_id AND maps.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update regions on their maps"
  ON regions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM maps WHERE maps.id = regions.map_id AND maps.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete regions on their maps"
  ON regions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM maps WHERE maps.id = regions.map_id AND maps.user_id = auth.uid()
    )
  );

-- ============================================
-- MAP_IMAGES POLICIES (via map ownership)
-- ============================================
CREATE POLICY "Users can view images of their maps"
  ON map_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM maps WHERE maps.id = map_images.map_id AND maps.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can upload images to their maps"
  ON map_images FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM maps WHERE maps.id = map_images.map_id AND maps.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update images of their maps"
  ON map_images FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM maps WHERE maps.id = map_images.map_id AND maps.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete images of their maps"
  ON map_images FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM maps WHERE maps.id = map_images.map_id AND maps.user_id = auth.uid()
    )
  );

-- ============================================
-- PROMPT_HISTORY POLICIES (via map ownership)
-- ============================================
CREATE POLICY "Users can view prompts of their maps"
  ON prompt_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM maps WHERE maps.id = prompt_history.map_id AND maps.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create prompts for their maps"
  ON prompt_history FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM maps WHERE maps.id = prompt_history.map_id AND maps.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete prompts of their maps"
  ON prompt_history FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM maps WHERE maps.id = prompt_history.map_id AND maps.user_id = auth.uid()
    )
  );
