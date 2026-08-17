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

Go to Supabase Dashboard > SQL Editor and run these files in order:

1. `migrations/001_initial_schema.sql` - Creates all tables
2. `migrations/002_rls_policies.sql` - Sets up Row Level Security
3. `migrations/003_storage_and_cleanup.sql` - Creates storage bucket and cleanup function

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
