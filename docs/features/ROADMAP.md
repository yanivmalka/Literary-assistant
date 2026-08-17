# Feature Roadmap

## Phase 1 - Maps MVP (DONE)
- [x] Interactive canvas editor with Konva.js
- [x] 9 marker types (water, mountains, city, capital, borders, desert, forest, village, custom)
- [x] Drag & drop + click to place
- [x] Region detection and grouping
- [x] Place naming + AI name suggestions
- [x] Prompt generation for external AI tools
- [x] Image upload (upload AI-generated map back)
- [x] Export (PNG/JPG/PDF)
- [x] Project management + trash (30-day auto-delete)
- [x] Auth (Supabase: email + Google)
- [x] i18n (English + Hebrew + RTL)
- [x] Material selection (parchment, paper, aged, leather, stone)
- [x] Map type selection (world, continent, country, city, region)

## Phase 2 - Characters Module
- [ ] Character profile form (questionnaire)
- [ ] AI prompt generation for character portraits
- [ ] Portrait upload + profile card
- [ ] Manuscript upload (PDF/DOCS)
- [ ] Description consistency checker
- [ ] Error report generation
- [ ] Premium: Age progression timeline (up to 10 stages)
- [ ] Premium: Character image gallery
- [ ] Premium: Character cross-reference images

## Phase 3 - Environment Module
- [ ] Automatic location extraction from manuscript (top 5)
- [ ] Environment profile creation
- [ ] Profile editing with image regeneration
- [ ] Keyword-based profile creation
- [ ] Premium: Hierarchical folder organization
- [ ] Link to Maps module (locations ↔ map markers)

## Phase 4 - Magic & Abilities Module
- [ ] Magic system analysis from manuscript
- [ ] Ability profiles with character/environment links
- [ ] Automatic folder organization
- [ ] Logical gap detection
- [ ] Usage image generation (character + environment + ability)
- [ ] User reorganization (drag & drop)

## Phase 5 - Polish & Premium
- [ ] Payment integration (Stripe/Paddle)
- [ ] Premium feature gating
- [ ] Advanced AI integration (direct API calls to image generation)
- [ ] Collaborative features (share projects)
- [ ] Mobile responsive optimization
- [ ] Onboarding tutorial
- [ ] API rate limiting & abuse prevention
- [ ] Analytics dashboard

## Technical Debt & Improvements
- [ ] Code-split editor components for better load times
- [ ] Add E2E tests (Playwright)
- [ ] Add unit tests for region detection algorithm
- [ ] Service worker for offline canvas editing
- [ ] WebSocket for real-time auto-save feedback
- [ ] Image optimization pipeline (resize, compress on upload)
