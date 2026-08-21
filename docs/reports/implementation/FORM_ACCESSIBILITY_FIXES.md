# Form Accessibility Fixes - August 20, 2026

## Issue
Browser showing warnings about form fields missing `id`, `name`, and `autocomplete` attributes:
- "A form field element should have an id or name attribute"
- "An element doesn't have an autocomplete attribute"

## Root Cause
Multiple form input and textarea elements throughout the app lacked proper HTML attributes for browser autofill and accessibility compliance.

## Files Fixed

### 1. QAPanel.tsx
- **Input:** `#qa-input` chat input
- **Added:** `id="qa-input"`, `name="qa-input"`, `autoComplete="off"`

### 2. MarkerPalette.tsx  
- **Inputs:** Marker name and color inputs
- **Added:** `id` and `name` attributes for both; `autoComplete="off"` for text input

### 3. NamingPanel.tsx
- **Inputs:** Region and marker naming inputs
- **Added:** Dynamic `id` based on region/marker ID, corresponding `name` attributes, `autoComplete="off"`

### 4. PromptPanel.tsx
- **Textarea:** Prompt editing textarea
- **Added:** `id="prompt-textarea"`, `name="prompt"`, `autoComplete="off"`

### 5. UploadPanel.tsx
- **Input:** File upload input
- **Added:** `id="file-upload"`, `name="file-upload"`

### 6. EditorToolbar.tsx
- **Input:** Stroke width slider
- **Added:** `id="stroke-width"`, `name="stroke-width"`

### 7. BranchPage.tsx
- **Inputs:** Entity name, description, attributes, branch name inputs
- **Added:** Proper `id`, `name`, and `autoComplete="off"` to all form fields

### 8. DebugAuthPage.tsx
- **Inputs:** Email and password test inputs
- **Added:** `id="test-email"`, `id="test-password"` with appropriate `name` and `autoComplete` attributes

### 9. DevTestPage.tsx
- **Textarea:** Prompt textarea
- **Added:** `id="dev-test-prompt"`, `name="prompt"`, `autoComplete="off"`

### 10. MapWizardPage.tsx
- **Inputs:** Map name and description
- **Added:** `id="map-name"`, `id="map-description"` with `name` and `autoComplete="off"`

### 11. ProjectsPage.tsx
- **Inputs:** Project name and description
- **Added:** `id="project-name"`, `id="project-description"` with proper `name` and `autoComplete="off"`

### 12. AccountSettingsPage.tsx
- **Inputs:** Password fields
- **Added:** `id="new-password"`, `id="confirm-password"` with `autoComplete="new-password"`

## Verification
- Build completed successfully: `npm run build` ✅
- No TypeScript errors
- All form fields now have proper accessibility attributes

## Browser Behavior Impact
- Autofill will now work correctly for supported fields (email, password, etc.)
- Screen readers will properly identify form fields
- Form submission workflows will be more reliable
- No functional changes to the app

## Standards Compliance
- HTML5 form best practices
- WCAG accessibility guidelines
- Browser autofill standards
