# Refactoring Plan: Generic Dashboard Structure

## Goal
Make the dashboard generic to support multiple SEWAi features, not just monologue.

## Current Structure
```
/                           → Monologue dashboard (stats + students)
/students/[id]              → Monologue student detail
/sessions/[roomName]        → Monologue session detail
```

## New Structure
```
/                                    → Generic hub (all features overview)
/general/monologue-v2/               → Monologue dashboard
/general/monologue-v2/students/[id]  → Monologue student detail  
/general/monologue-v2/sessions/[roomName] → Monologue session detail
```

## Tasks

### 1. Create Generic Hub (`/`)
- New dashboard showing all features (monologue, future features)
- Feature cards that link to each feature's dashboard
- High-level metrics across all features

### 2. Move Monologue Pages to `/general/monologue-v2/`

**Create directory structure:**
```
src/app/general/monologue-v2/
├── page.tsx                    (current dashboard)
├── students/
│   └── [id]/
│       └── page.tsx
└── sessions/
    └── [roomName]/
        └── page.tsx
```

**Files to move:**
- `src/app/page.tsx` → `src/app/general/monologue-v2/page.tsx`
- `src/app/students/[id]/page.tsx` → `src/app/general/monologue-v2/students/[id]/page.tsx`
- `src/app/sessions/[roomName]/page.tsx` → `src/app/general/monologue-v2/sessions/[roomName]/page.tsx`

### 3. Update Navigation Links

**In monologue pages:**
- Student table row click → `/general/monologue-v2/students/[id]`
- Session row click → `/general/monologue-v2/sessions/[roomName]`
- Back buttons → `/general/monologue-v2/`

### 4. Update API Route References (if any hardcoded)

API routes stay the same:
- `/api/stats` (add feature filter support)
- `/api/students` (add feature filter)
- `/api/students/[id]`
- `/api/sessions/[roomName]`

### 5. Create Generic Dashboard (`/`)

**Content:**
```
┌─────────────────────────────────────────────────────┐
│  🎓 SEWAi Analytics Hub                             │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────────┐  ┌──────────────────┐        │
│  │  Monologue v2    │  │  Future Feature  │        │
│  │  📊 45 sessions  │  │  Coming Soon     │        │
│  │  👥 12 students  │  │                  │        │
│  │  → View Details  │  │                  │        │
│  └──────────────────┘  └──────────────────┘        │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 6. Update Components

**StudentTable.tsx:**
- Change link to include `/general/monologue-v2/students/`

**SessionList.tsx:**
- Change link to include `/general/monologue-v2/sessions/`

**EventTimeline.tsx:**
- Update back button to `/general/monologue-v2/students/[id]`

## Implementation Steps

1. ✅ Pull latest code
2. Create `/general/monologue-v2/` directory structure
3. Move existing pages to new location
4. Update all internal links in moved pages
5. Create new generic hub at `/`
6. Update component imports if needed
7. Test navigation flow
8. Commit and push

## Note

API routes and components can mostly stay the same. Main changes are:
- Page locations
- Navigation links
- New generic hub page
