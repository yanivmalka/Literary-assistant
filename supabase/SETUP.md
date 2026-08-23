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

Use **one** migration mechanism per environment:

- **Supabase CLI:** run the normal migration command (`supabase db push`) and let the CLI track applied migrations.
- **SQL Editor:** run only migration files that are not already applied, in numeric order.

Do not run the complete `supabase/migrations/` directory repeatedly, and do not manually insert rows into the migration history table. If a migration reports a duplicate key in `schema_migrations`, stop and inspect the migration history before retrying; rerunning the file can create schema drift or duplicate data.

The runtime reconciliation migration is `128_reconcile_runtime_schema.sql`. Apply it **once** after migrations `001`–`127` are already present. It:

- removes only the stale `knowledge_entities_version_name_unique` constraint/index;
- recreates `get_quill_wallet()` with qualified `user_id` references;
- limits that RPC's execution privilege to authenticated users;
- does not delete application rows.

Do not edit an already-applied migration to repair a deployed database. Add a new numbered migration instead.

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
