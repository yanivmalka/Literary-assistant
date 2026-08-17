# Bug Tracking

## How to Report a Bug

Add a new entry below using this template:

```
### [BUG-XXX] Short description
- **Status**: OPEN | IN PROGRESS | FIXED | WONT FIX
- **Severity**: CRITICAL | HIGH | MEDIUM | LOW
- **Module**: Maps | Auth | Projects | Editor | Export | General
- **Date Reported**: YYYY-MM-DD
- **Steps to Reproduce**:
  1. Step one
  2. Step two
- **Expected Behavior**: What should happen
- **Actual Behavior**: What actually happens
- **Fix Applied**: (fill when fixed)
- **Notes**: Any additional context
```

---

## Resolved Bugs

### [BUG-001] Database error saving new user on signup
- **Status**: FIXED
- **Severity**: CRITICAL
- **Module**: Auth
- **Date Reported**: 2026-08-17
- **Steps to Reproduce**:
  1. Go to signup page
  2. Fill in email and password
  3. Click "Sign Up"
- **Expected Behavior**: User account created, profile auto-generated
- **Actual Behavior**: "Database error saving new user" message
- **Fix Applied**: Updated `handle_new_user()` trigger function with:
  - Added `SET search_path = public` to ensure correct schema resolution
  - Added `EXCEPTION WHEN others` block so signup doesn't fail if profile creation has issues
  - Improved name fallback logic (checks `full_name`, `name`, then email prefix)
- **Notes**: Root cause was the trigger function not finding `profiles` table due to missing search_path

---

## Open Bugs

<!-- Add new bugs here -->

---

## Known Limitations (not bugs)

### Canvas size on initial load
- The canvas width/height is approximated on first render. Resizing the window updates it correctly.
- **Workaround**: None needed for most cases. Will be fixed with proper ResizeObserver in polish phase.

### AI Name Suggestions require API key
- Without a HuggingFace API key configured in the server `.env`, fallback names are generated locally.
- **Workaround**: Fallback names are still useful fantasy-style names. Set `HUGGINGFACE_API_KEY` in `server/.env` for AI-powered suggestions.

### Large canvas state save latency
- Auto-save is debounced (2 seconds). On very complex maps (100+ markers), the save payload can be large.
- **Workaround**: Manual save button always available. Consider pagination or delta-saves in future.

### Export PDF quality
- PDF export uses canvas rasterization. Very large maps may lose detail at default resolution.
- **Workaround**: Export as PNG at higher resolution, then convert to PDF externally.
