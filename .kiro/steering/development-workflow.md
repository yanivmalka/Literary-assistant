---
inclusion: auto
---

# Development Workflow

## Running the Project

### Prerequisites
- Node.js 18+
- A Supabase project (free tier is fine)

### Setup
```bash
# Install all dependencies
npm run install:all

# Configure environment
# Copy client/.env.example to client/.env and fill in Supabase credentials
# Copy server/.env.example to server/.env (optional: add HuggingFace API key)

# Run Supabase migrations (in Supabase SQL Editor, in numeric order)
# Apply every file under supabase/migrations/ before deploying Edge Functions.
# The current extraction flow specifically requires migrations 115-121,
# including 120_reconcile_extraction_metadata.sql and
# 121_set_current_model_profile_default.sql.
```

### Development
```bash
# Start both frontend (port 5173) and backend (port 3001)
npm run dev

# Or run separately:
npm run dev:client   # Vite dev server
npm run dev:server   # Express with tsx watch
```

### Building
```bash
npm run build
# Output: client/dist/ (static files) and server/dist/ (compiled JS)
```

## Adding a New Feature

1. Create a feature planning doc in `docs/features/`
2. Add database schema additions to a new migration file in `supabase/migrations/`
3. Add TypeScript types to `client/src/lib/types.ts`
4. Create a Zustand store in `client/src/stores/` if needed
5. Build UI components in `client/src/components/{feature}/`
6. Add page(s) in `client/src/pages/`
7. Add route(s) in `client/src/App.tsx`
8. Add translations to both `en.json` and `he.json`
9. Test in both English and Hebrew
10. Update `docs/features/ROADMAP.md`

## Adding a New API Endpoint

1. Add route in `server/src/index.ts` (or create a routes file if it gets large)
2. The Vite proxy forwards `/api/*` to the Express server automatically
3. No auth needed on server side for MVP (Supabase handles it client-side)

## Supabase Schema Changes

1. Write SQL migration as a new numbered file: `supabase/migrations/XXX_description.sql`
2. Run in Supabase SQL Editor
3. Add corresponding TypeScript types in `client/src/lib/types.ts`
4. Add RLS policies for new tables

## Debugging Tips

- **Supabase errors**: Check Dashboard > Logs > Postgres logs
- **Auth issues**: Check Dashboard > Authentication > Users
- **Storage issues**: Check Dashboard > Storage > map-images bucket
- **Canvas issues**: Use React DevTools + Konva stage inspection
- **State issues**: Zustand stores are inspectable via React DevTools (or add `devtools` middleware)
- **Network**: Vite proxy logs show API calls; check browser DevTools Network tab

## Bug Reporting
See `docs/BUGS.md` for the template and known issues.
