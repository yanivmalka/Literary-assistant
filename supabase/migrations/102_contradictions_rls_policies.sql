-- Migration 102: Add contradictions RLS policies
-- Date: 2026-08-20
-- Purpose: Secure contradictions table with ownership-based RLS policies
--
-- Changes:
-- 1. Create SELECT policy: Users can read contradictions for projects/branches they own
-- 2. Create INSERT policy: System/Edge functions only (not authenticated users)
-- 3. Create UPDATE policy: Users can update contradictions for their projects/branches
-- 4. Create DELETE policy: Users can delete contradictions for their projects/branches
--
-- Security: All contradictions scoped by project_id, which controls user access
-- Note: INSERT policy uses role = 'authenticated' temporarily; Edge Functions should use service_role

-- Enable RLS (should already be enabled, but ensure it's on)
ALTER TABLE contradictions ENABLE ROW LEVEL SECURITY;

-- SELECT policy: Users can view contradictions for projects/branches they own
CREATE POLICY "Users can view own contradictions"
  ON contradictions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = contradictions.project_id 
        AND projects.user_id = auth.uid()
    )
  );

-- INSERT policy: Only service role or edge functions can insert
-- Note: This policy allows authenticated users to insert (to be refined for Edge Functions in v1.5)
CREATE POLICY "System can insert contradictions"
  ON contradictions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = contradictions.project_id 
        AND projects.user_id = auth.uid()
    )
  );

-- UPDATE policy: Users can update their own contradictions
CREATE POLICY "Users can update own contradictions"
  ON contradictions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = contradictions.project_id 
        AND projects.user_id = auth.uid()
    )
  );

-- DELETE policy: Users can delete their own contradictions
CREATE POLICY "Users can delete own contradictions"
  ON contradictions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = contradictions.project_id 
        AND projects.user_id = auth.uid()
    )
  );
