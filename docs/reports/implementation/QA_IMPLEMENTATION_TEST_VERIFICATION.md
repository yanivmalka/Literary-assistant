# Q&A Implementation: Live Test Verification

**Date:** August 20, 2026  
**Implementation Status:** ✅ Complete  
**Deployment Status:** ✅ Deployed  

---

## Deployment Summary

### Edge Function: ask-question

**Location:** `supabase/functions/ask-question/index.ts`  
**Project ID:** `lqfqfzqcrqluxanhnjwu`  
**URL:** `https://lqfqfzqcrqluxanhnjwu.supabase.co/functions/v1/ask-question`  
**Status:** ✅ Live

**Deployment Command:**
```bash
supabase functions deploy ask-question
```

**Assets Deployed:**
- `ask-question/index.ts` (main function)
- `_shared/gemini-client.ts` (dependency)
- `_shared/gemini-config.ts` (dependency)

---

## Implementation Architecture

### 1. Edge Function: ask-question

**Request Interface:**
```typescript
interface AskQuestionRequest {
  project_id: string;
  question: string;
  top_k?: number;        // Default: 5
  branch_id?: string | null;
}
```

**Response Interface:**
```typescript
interface QAResult {
  answer: string;                    // Generated answer from Gemini
  sources: QASource[];              // Document chunks with context
  entitiesReferenced: string[];     // Knowledge entities mentioned
  noSufficientContext: boolean;     // True if insufficient context found
  modelUsed?: string;               // Fallback model used
  latencyMs?: number;               // Latency in milliseconds
}
```

**Processing Pipeline:**
1. Authenticate via Authorization header (Bearer token)
2. Verify user owns project
3. Hybrid search: full-text search on document_chunks (with fallback to ILIKE)
4. Entity lookup: find knowledge_entities matching question keywords
5. Context building: format chunks with chapter/page references
6. Gemini call: send prompt with context to LLM (with multi-model fallback)
7. Response parsing: extract answer text and detect insufficient-context flags
8. Return: answer + sources + entities + metadata

**Error Handling:**
- Returns 401 on authentication failure
- Returns 403 on authorization failure (user doesn't own project)
- Returns 400 on invalid input
- Returns 200 with `success: false` on operational errors (non-blocking)
- Falls back to sources-only if Gemini unavailable

### 2. Client Store: qaStore.ts

**State Management:**
```typescript
interface QAState {
  messages: QAMessage[];
  loading: boolean;
  error: string | null;
  ask: (projectId: string, question: string) => Promise<void>;
  clearHistory: () => void;
}
```

**Message Types:**
- `'question'`: User question
- `'answer'`: LLM response with sources
- `'error'`: Error message

**Call Pattern:**
1. Get authenticated user session
2. Construct Edge Function URL from `VITE_SUPABASE_URL`
3. Call fetch with Bearer token authorization
4. Parse response: check `success` and `result` fields
5. Add question message to history
6. Add answer/error message with appropriate metadata
7. Handle insufficient-context flag for UI

### 3. UI Component: QAPanel.tsx

**Display States:**
- ✅ Placeholder message (no history)
- ✅ Question bubbles (right-aligned, primary color)
- ✅ Answer bubbles (with text wrapping)
- ✅ Source references (list of chunks with citations)
- ✅ Entity tags (referenced knowledge entities)
- ✅ Insufficient-context warning (amber styling)
- ✅ Error messages (destructive styling with alert icon)
- ✅ Loading indicator (spinner + "thinking" message)

**User Interactions:**
- Type question → click Send or press Enter
- Clear history → click trash icon
- View sources → click on source reference to expand
- Error recovery → automatically shown in message list

---

## Live Test Checklist

### Prerequisites
- [ ] Application is deployed
- [ ] User is logged in
- [ ] Project exists with documents
- [ ] Documents are processed (status: `ready`, `indexed`, or `skipped_no_provider`)
- [ ] Gemini API key is configured in Supabase secrets

### Test Scenarios

#### Scenario 1: Basic Q&A with Results

**Steps:**
1. Open Q&A panel
2. Ask a question about document content
3. Example: "Who is the main character?"

**Expected Behavior:**
- [ ] Loading spinner appears
- [ ] Question is added to history (right-aligned)
- [ ] After ~2-5 seconds, answer appears
- [ ] Answer includes relevant information from documents
- [ ] Sources are listed below answer
- [ ] Source citations show chapter/page if available

**Success Criteria:**
- Answer is grounded in document content
- At least 1 source reference is shown
- No hallucinated information outside sources

---

#### Scenario 2: Insufficient Context

**Steps:**
1. Ask a question that cannot be answered from documents
2. Example: "What is the capital of Mars?"

**Expected Behavior:**
- [ ] Loading spinner appears
- [ ] Question is added to history
- [ ] After processing, insufficient-context warning appears
- [ ] Warning message: "I could not find sufficient information..."
- [ ] Amber-styled alert box is displayed
- [ ] No sources shown (or empty sources list)

**Success Criteria:**
- Message clearly indicates lack of context
- No fabricated answers provided
- UI gracefully handles empty results

---

#### Scenario 3: Entity Recognition

**Steps:**
1. Ask a question about a known entity
2. Example: "What does [character name] do?"

**Expected Behavior:**
- [ ] Answer is provided (if in documents)
- [ ] Entity tags appear below answer
- [ ] Entity shows name as a blue tag
- [ ] Multiple entities can be shown as multiple tags

**Success Criteria:**
- Entities referenced in the answer are correctly identified
- Entity names match knowledge base entities
- Tags are properly formatted

---

#### Scenario 4: Multiple Questions (History)

**Steps:**
1. Ask first question
2. Wait for answer
3. Ask second question about different topic
4. Wait for answer

**Expected Behavior:**
- [ ] First Q&A pair remains in history above
- [ ] Second Q&A pair is added below
- [ ] Scroll automatically shows latest message
- [ ] History is chronological

**Success Criteria:**
- All Q&A pairs are preserved
- Scrolling works smoothly
- Each pair maintains correct styling

---

#### Scenario 5: Error Handling

**Steps:**
1. Intentionally cause an error:
   - Log out and try to ask question, OR
   - Manually call Edge Function with invalid token

**Expected Behavior:**
- [ ] Error message appears in red/destructive style
- [ ] Error includes alert icon
- [ ] User-friendly error text is shown
- [ ] Specific error details (if applicable)

**Success Criteria:**
- Error is clearly visible
- Error message guides user (e.g., "authentication required")
- UI doesn't crash or freeze

---

#### Scenario 6: Fallback Model Usage

**Steps:**
1. Monitor browser console network tab
2. Ask a question
3. Check Edge Function logs or response metadata

**Expected Behavior:**
- [ ] `modelUsed` field in response shows model name
- [ ] If primary model fails, secondary model used
- [ ] Answer is still generated (no silent failure)

**Success Criteria:**
- Fallback works transparently
- Answer quality maintained
- Latency is reasonable (< 10 seconds)

---

#### Scenario 7: Clear History

**Steps:**
1. Ask multiple questions to build history
2. Click trash/clear icon in header

**Expected Behavior:**
- [ ] All messages disappear
- [ ] Placeholder text reappears
- [ ] Panel is reset to empty state

**Success Criteria:**
- All messages cleared
- No remnant data persists
- Clear action is reversible only via new questions

---

## Performance Baselines

| Metric | Target | Notes |
|--------|--------|-------|
| Time to first answer | < 5s | Includes Gemini latency |
| Source retrieval | < 500ms | Document chunk search |
| Entity lookup | < 200ms | Knowledge entity query |
| Gemini generation | < 3s | With fallback retry |
| Total latency | < 10s | End-to-end |

---

## Deployment Verification

**Verification Command:**
```bash
# Check function exists
supabase functions list

# Output should include:
# ask-question     ACTIVE    created at 2026-08-20
```

**Function URL Pattern:**
```
https://{PROJECT_ID}.supabase.co/functions/v1/ask-question
```

**Environment Variables Required:**
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role for DB access
- `GEMINI_API_KEY`: Gemini API key (set as Supabase secret)

---

## Code Quality

### Type Checking
- ✅ Deno check: `deno check ask-question/index.ts` passes
- ✅ Client TypeScript: No Q&A-related errors

### Error Handling
- ✅ Authentication failures handled with 401
- ✅ Authorization failures handled with 403
- ✅ Invalid input handled with 400
- ✅ LLM failures fall back to sources-only mode
- ✅ Network failures handled with user-friendly messages

### Security
- ✅ User authentication required via Bearer token
- ✅ Project ownership verified
- ✅ Service role isolated to DB operations
- ✅ CORS headers properly configured
- ✅ No credentials exposed in client code

---

## Integration Points

### 1. Supabase Tables Used
- `projects` (user_id, id)
- `documents` (project_id)
- `document_versions` (status: ready|indexed|skipped_no_provider)
- `document_chunks` (full-text search)
- `knowledge_entities` (entity lookup)

### 2. External APIs
- **Gemini API** (with multi-model fallback)
  - Primary: `gemini-3.5-flash`
  - Secondary: `gemini-3.5-flash-lite`
  - Tertiary: `gemini-2.5-flash`

### 3. Client Environment
- `VITE_SUPABASE_URL`: Used to construct Edge Function URL
- `VITE_API_URL`: Not used for Q&A (direct Edge Function call)

---

## Known Limitations & Future Enhancements

### Current Limitations
1. Q&A searches Main layer documents only (not branch-specific)
2. Entity lookup is simple keyword matching (not semantic)
3. No user session persistence for Q&A history
4. Gemini model fallback only within same model family

### Future Enhancements
1. Branch-specific context retrieval for branch editing workflows
2. Semantic similarity search via embeddings
3. Q&A history persistence per project/user
4. Multi-document cross-references
5. Follow-up question clarification
6. Confidence scoring for answers

---

## Testing Notes

**Manual Browser Testing:**
1. Navigate to project page
2. Open Q&A panel (usually sidebar or modal)
3. Type question: "Tell me about the main characters"
4. Observe loading state
5. Verify answer appears with sources

**Debug Output:**
- Browser console: fetch request logs
- Edge Function logs: Available in Supabase dashboard
- Latency info: Included in response metadata

**Test Data Requirements:**
- Minimum 1 processed document
- Document should have at least 5 chunks
- Chunks should contain recognizable named entities

---

## Sign-Off

**Implementation Complete:** ✅ August 20, 2026  
**Deployment Status:** ✅ Live on Supabase  
**Ready for Production Testing:** ✅ Yes  

**Next Steps:**
1. Perform manual browser-based Q&A test
2. Verify all display states (answer, error, insufficient-context)
3. Check source citations are accurate
4. Monitor latency and error rates
5. Gather user feedback for refinement

---
