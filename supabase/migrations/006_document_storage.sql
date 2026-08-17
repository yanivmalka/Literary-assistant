-- ============================================
-- Storage Bucket for Project Documents
-- Run this in the Supabase SQL Editor AFTER 005_document_rls_policies.sql
-- ============================================

-- Create storage bucket for project documents (PDF, DOCX)
-- Structure: project-documents/{user_id}/{project_id}/{document_id}/{version_number}/{filename}
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('project-documents', 'project-documents', false, 52428800)  -- 50MB limit
ON CONFLICT (id) DO NOTHING;

-- Users can upload documents to their own folder
CREATE POLICY "Users can upload their own project documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'project-documents' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can view their own documents
CREATE POLICY "Users can view their own project documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'project-documents' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can update their own documents
CREATE POLICY "Users can update their own project documents"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'project-documents' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete their own documents
CREATE POLICY "Users can delete their own project documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'project-documents' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
