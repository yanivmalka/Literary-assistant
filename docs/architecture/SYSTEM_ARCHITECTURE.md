# System Architecture

## High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER BROWSER                              │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    React Application                        │ │
│  │                                                            │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │ │
│  │  │  Pages   │  │  Stores  │  │Components│  │   i18n   │ │ │
│  │  │          │  │(Zustand) │  │          │  │ (EN/HE)  │ │ │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────────┘ │ │
│  │       │              │              │                      │ │
│  │       └──────────────┼──────────────┘                      │ │
│  │                      │                                     │ │
│  │              ┌───────┴───────┐                             │ │
│  │              │ Supabase SDK  │                             │ │
│  │              └───────┬───────┘                             │ │
│  └──────────────────────┼─────────────────────────────────────┘ │
│                         │                                        │
└─────────────────────────┼────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
          ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Supabase   │ │   Supabase   │ │   Supabase   │
│  PostgreSQL  │ │     Auth     │ │   Storage    │
│              │ │              │ │              │
│ - profiles   │ │ - email/pass │ │ - map-images │
│ - projects   │ │ - Google     │ │              │
│ - maps       │ │              │ │ {user_id}/   │
│ - markers    │ │              │ │  {map_id}/   │
│ - regions    │ │              │ │   file.png   │
│ - map_images │ │              │ │              │
│ - prompts    │ │              │ │              │
└──────────────┘ └──────────────┘ └──────────────┘

                          │
                    ┌─────┴─────┐
                    │  Express  │
                    │  API      │
                    │ (port 3001)│
                    │           │
                    │ /api/suggest-names    → HuggingFace API (free)
                    │ /api/generate-prompt  → (future: server-side prompt)
                    │ /api/health           → health check
                    └───────────┘
```

## Component Dependency Map

```
App.tsx
├── Layout.tsx
│   ├── Header.tsx
│   │   └── LanguageSwitcher.tsx
│   └── <Outlet /> (pages)
│
├── HomePage.tsx
├── LoginPage.tsx (no layout)
├── SignUpPage.tsx (no layout)
│
├── ProjectsPage.tsx ← projectStore
├── ProjectDetailPage.tsx ← projectStore
├── TrashPage.tsx ← projectStore
│
├── MapWizardPage.tsx ← supabase direct (one-time create)
└── MapEditorPage.tsx ← mapStore
    ├── EditorToolbar.tsx ← mapStore (zoom, undo/redo, save)
    ├── MarkerPalette.tsx ← mapStore (activeToolType)
    ├── CanvasEditor.tsx ← mapStore (markers, regions, viewport)
    └── Right Sidebar:
        ├── NamingPanel.tsx ← mapStore (unnamed markers)
        ├── PromptPanel.tsx ← mapStore (generate from canvas state)
        └── UploadPanel.tsx ← mapStore + supabase storage
```

## State Flow

```
User Action → Component → Store Action → Supabase API → Store Update → Re-render

Example: Place marker
1. User clicks canvas with active tool
2. CanvasEditor.handleStageClick()
3. mapStore.addMarker({ id, type, x, y, ... })
4. State updates → CanvasEditor re-renders with new marker
5. isDirty = true → auto-save timer (2s) → mapStore.saveCanvas()
6. canvas_state JSON saved to Supabase maps table
```

## Security Model

```
┌─────────────────────────────────────────────┐
│              Row Level Security              │
│                                             │
│  profiles:  auth.uid() = id                 │
│  projects:  auth.uid() = user_id            │
│  maps:      auth.uid() = user_id            │
│  markers:   via maps.user_id join           │
│  regions:   via maps.user_id join           │
│  map_images: via maps.user_id join          │
│  prompts:   via maps.user_id join           │
│  storage:   path starts with auth.uid()     │
│                                             │
│  Result: Users can ONLY see/modify their    │
│  own data. No server-side auth needed.      │
└─────────────────────────────────────────────┘
```

## Technology Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Frontend framework | React + Vite | Fast dev, rich ecosystem, TypeScript support |
| Canvas library | Konva.js | Mature 2D canvas lib with React bindings, drag&drop built-in |
| State management | Zustand | Minimal boilerplate, good TS support, no providers needed |
| CSS | Tailwind + CSS vars | Utility-first, RTL support, shadcn/ui compatible |
| Backend/DB | Supabase (free) | PostgreSQL + Auth + Storage in one. No server management. |
| API server | Express | Only for AI name suggestions. Minimal surface area. |
| i18n | react-i18next | Industry standard, RTL support, pluralization |
| AI (names) | HuggingFace free API | Free tier for MVP, fallback names if no key |
| AI (images) | External (user-operated) | No API cost. Generate prompt → user pastes in Midjourney/etc |
| Export | Konva toDataURL + jsPDF | Client-side, no server needed |
