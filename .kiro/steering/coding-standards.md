---
inclusion: auto
---

# Coding Standards

## Language & Framework
- TypeScript strict mode everywhere
- React functional components only (no class components)
- Zustand for state management (no Redux, no Context for global state)
- Tailwind CSS for styling (no CSS modules, no styled-components)

## File Naming
- Components: PascalCase (`MarkerPalette.tsx`)
- Stores: camelCase with `Store` suffix (`mapStore.ts`)
- Utils/libs: camelCase (`regionDetection.ts`)
- Pages: PascalCase with `Page` suffix (`MapEditorPage.tsx`)

## Component Patterns
- Pages go in `src/pages/`
- Reusable components go in `src/components/`
- Feature-specific components go in `src/components/{feature}/`
- Keep components focused: if > 200 lines, consider splitting

## State Management
- Auth state: `authStore` (Supabase session, user, profile)
- Project/map CRUD: `projectStore` (fetching, creating, deleting projects)
- Canvas state: `mapStore` (markers, regions, history, active tool)
- Local UI state: `useState` within components
- Toast notifications: `useToastStore` (via Toast.tsx)

## Database Access Pattern
- All Supabase queries go through Zustand store actions
- Components call store actions, never query Supabase directly
- RLS handles authorization; no need for manual user_id checks in queries
- Always handle errors gracefully (show toast, don't crash)

## i18n Rules
- Every user-visible string must use `t('key')` from react-i18next
- Translation keys: `module.section.key` (e.g., `editor.markers.water`)
- Both `en.json` and `he.json` must be kept in sync
- New features must add translations to both files before merging

## RTL Support
- Use logical properties: `start`/`end` not `left`/`right`
- Tailwind: `ps-4` (padding-start), `me-2` (margin-end), `border-s` (border-start)
- `text-start` / `text-end` instead of `text-left` / `text-right`
- The `dir` attribute on `<html>` switches automatically based on language

## Git Conventions
- Branch naming: `feature/module-name`, `fix/bug-description`
- Commit messages: concise English, present tense ("Add character form", "Fix auth redirect")
- Don't commit `.env` files (only `.env.example`)
- Don't commit `node_modules/` or `dist/`
