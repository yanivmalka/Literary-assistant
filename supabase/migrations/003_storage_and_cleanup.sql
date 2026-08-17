-- ============================================
-- Storage Bucket & Trash Auto-Cleanup
-- Run this in the Supabase SQL Editor AFTER 002_rls_policies.sql
-- ============================================

-- ============================================
-- STORAGE BUCKET FOR MAP IMAGES
-- Create via Supabase Dashboard > Storage > New Bucket
-- Name: map-images
-- Public: false (authenticated access only)
-- 
-- Or use this SQL (requires service_role):
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('map-images', 'map-images', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for the map-images bucket
CREATE POLICY "Users can upload their own map images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'map-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view their own map images"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'map-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own map images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'map-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own map images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'map-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================
-- TRASH AUTO-CLEANUP FUNCTION
-- Permanently deletes items that have been in trash for 30+ days
-- Schedule this via Supabase Dashboard > Database > Extensions > pg_cron
-- Or call manually / via Edge Function
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_trash()
RETURNS void AS $$
BEGIN
  -- Delete maps that have been in trash for 30+ days
  DELETE FROM maps
  WHERE deleted_at IS NOT NULL
    AND deleted_at < NOW() - INTERVAL '30 days';

  -- Delete projects that have been in trash for 30+ days
  DELETE FROM projects
  WHERE deleted_at IS NOT NULL
    AND deleted_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- SCHEDULE CLEANUP (requires pg_cron extension)
-- Enable pg_cron via Supabase Dashboard > Database > Extensions
-- Then uncomment and run:
-- ============================================
-- SELECT cron.schedule(
--   'cleanup-trash-daily',
--   '0 3 * * *', -- Run at 3 AM daily
--   'SELECT cleanup_trash()'
-- );
