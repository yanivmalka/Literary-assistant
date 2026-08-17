---
inclusion: auto
---

# Fantasy Map Builder - System Overview

## What This Project Is
A web application for fantasy book authors to create, manage, and visualize world maps. The tool helps maintain consistency in fictional worlds by organizing maps, locations, characters, and magic systems within project folders.

## Current State
- **MVP**: Maps module is fully implemented
- **Placeholders**: Characters, Environment, and Magic modules have UI placeholders (greyed out "Coming Soon" cards)
- **Auth**: Working via Supabase (email + Google OAuth)
- **i18n**: English and Hebrew with full RTL support

## Architecture

### Frontend (client/)
- **Framework**: React 19 + TypeScript + Vite
- **Canvas**: Konva.js via react-konva for the interactive map editor
- **State**: Zustand stores (authStore, projectStore, mapStore)
- **Styling**: Tailwind CSS with CSS variables (shadcn/ui pattern)
- **Routing**: React Router v7
- **i18n**: react-i18next with EN/HE JSON files

### Backend (server/)
- **Framework**: Express + TypeScript
- **Purpose**: Light API for AI name suggestions (HuggingFace Inference API) and prompt generation
- **Runs on**: Port 3001, proxied by Vite dev server at /api

### Database & Services (Supabase)
- **PostgreSQL**: All data (projects, maps, markers, regions, prompt history)
- **Auth**: Email/password + Google OAuth
- **Storage**: map-images bucket for uploaded final maps
- **RLS**: Row Level Security ensures users only see their own data
- **Trigger**: `handle_new_user()` auto-creates profile on signup

## Key Data Flow

### Map Creation Flow
1. User creates a project → navigates to project detail
2. Clicks "New Map" → goes through 3-step wizard (material, type, description)
3. Map record saved to Supabase → redirected to canvas editor
4. User places markers on canvas → auto-saved every 2 seconds
5. User can name places (manually or AI suggestions)
6. User clicks "Generate Prompt" → detailed text prompt built from canvas state
7. User copies prompt → uses external AI tool → uploads result back
8. Final image stored in Supabase Storage, linked to map

### Marker System
9 marker types with color/shape encoding:
- Blue circles = Water (sea/lake/river)
- Grey triangles = Mountains
- Black dots = Cities
- Gold pentagons = Capital cities
- Red circles = Borders
- Yellow circles = Desert
- Green circles = Forest
- Brown dots = Villages/Towns
- Grey circles = Custom illustrations

### Region Detection (client/src/lib/regionDetection.ts)
- Same-type markers within proximity threshold (60px) are clustered
- Clusters of 3+ form a region with convex hull boundary
- Water regions auto-infer shape: elongated=river, large=sea, default=lake

## File Structure Reference

```
client/src/
├── App.tsx                    # Root with routing and i18n direction
├── main.tsx                   # Entry point with providers
├── components/
│   ├── Header.tsx             # Nav bar with auth + language switcher
│   ├── Layout.tsx             # Main layout wrapper with Outlet
│   ├── LanguageSwitcher.tsx   # EN/HE toggle button
│   ├── ProtectedRoute.tsx     # Auth guard
│   ├── Toast.tsx              # Toast notification system + store
│   └── editor/
│       ├── CanvasEditor.tsx   # Konva Stage with markers/regions rendering
│       ├── EditorToolbar.tsx  # Zoom, undo/redo, save controls
│       ├── MarkerPalette.tsx  # Sidebar with 9 marker types
│       ├── NamingPanel.tsx    # Right panel: name places + AI suggestions
│       ├── PromptPanel.tsx    # Right panel: generate/copy/edit prompt
│       └── UploadPanel.tsx    # Right panel: upload image + export
├── pages/
│   ├── HomePage.tsx           # Landing page with feature overview
│   ├── LoginPage.tsx          # Email + Google login
│   ├── SignUpPage.tsx         # Registration
│   ├── ProjectsPage.tsx      # "My Creations" grid
│   ├── ProjectDetailPage.tsx  # Single project with maps + placeholders
│   ├── MapWizardPage.tsx      # 3-step map creation wizard
│   ├── MapEditorPage.tsx      # Full editor layout (palette + canvas + panels)
│   └── TrashPage.tsx          # Soft-deleted items with restore/delete
├── stores/
│   ├── authStore.ts           # Supabase auth state + actions
│   ├── projectStore.ts        # CRUD for projects + trash
│   └── mapStore.ts            # Canvas state, markers, regions, history
├── lib/
│   ├── supabase.ts            # Supabase client init
│   ├── types.ts               # All TypeScript types + marker definitions
│   ├── regionDetection.ts     # Clustering + convex hull algorithms
│   └── utils.ts               # cn() utility
└── i18n/
    ├── index.ts               # i18next config
    ├── en.json                # English translations
    └── he.json                # Hebrew translations
```

## Conventions
- Use `@/` path alias for imports from src/
- All Supabase queries go through the stores, not directly in components
- Translation keys follow dot-notation hierarchy: `module.section.key`
- RTL support: use `start`/`end` instead of `left`/`right` in Tailwind (e.g., `ps-4`, `me-2`, `border-s`)
- Soft-delete pattern: `deleted_at` column, null = active, timestamp = trashed
- Markers are ephemeral in Zustand state; persisted as JSON in maps.canvas_state column
