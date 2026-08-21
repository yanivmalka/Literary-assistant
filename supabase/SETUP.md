# Supabase Setup Instructions

## 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project (choose a region close to your users)
3. Note your project URL and anon key from Settings > API

## 2. Configure Environment Variables

Copy the credentials to your `.env` file:

```
# client/.env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## 3. Run Migrations

Run every file in `supabase/migrations/` in numeric order in the Supabase SQL Editor (or with the Supabase CLI). Do not deploy the Edge Functions until the migrations have completed. In particular, the current extraction flow requires migrations 115-121, including `120_reconcile_extraction_metadata.sql` and `121_set_current_model_profile_default.sql`, which repair environments where the function was deployed before the extraction metadata schema.

Afterward, verify the columns required by the extraction function:

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'raw_extractions'
  AND column_name IN ('extraction_run_id', 'model_profile');
```

The query must return both columns.

## 4. Enable Auth Providers

Go to Supabase Dashboard > Authentication > Providers:

- **Email**: Enable email/password sign-up (enabled by default)
- **Google** (optional): Add Google OAuth credentials

## 5. Enable pg_cron (Optional)

For automatic trash cleanup:

1. Go to Database > Extensions
2. Enable `pg_cron`
3. Run the commented-out schedule command in `003_storage_and_cleanup.sql`

## 6. Storage

The migration creates a `map-images` bucket automatically.
File structure: `{user_id}/{map_id}/{filename}`
