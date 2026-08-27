import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Regression tests for qaStore.loadConversation.
 *
 * 1. Assistant-message text fallback: an assistant message with empty `content`
 *    must fall back to the "no results" text when metadata.no_sufficient_context
 *    is true, and to the static-mode fallback text otherwise.
 * 2. Conversation selection: loadConversation must pick the most recent
 *    conversation that actually has a message, skipping message-less
 *    conversation rows (e.g. orphan rows left after a failed QA turn) so a fresh
 *    question after a deletion starts a new conversation.
 */

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

import { supabase } from '@/lib/supabase'
import i18n from '@/i18n'
import { useQAStore } from '@/stores/qaStore'

interface MockConfig {
  /** Non-archived conversation rows returned for the project. */
  conversations: Array<{ id: string }>
  /** Newest notebook_messages row across the candidate conversations, or null. */
  latestMessage: { conversation_id: string } | null
  /** Stored messages returned for the selected conversation. */
  storedMessages: unknown[]
  /** Captured `.in()` filter argument from the latest-message query. */
  capturedInIds?: string[]
}

function mockSupabase(config: MockConfig) {
  ;(supabase.from as any).mockImplementation((table: string) => {
    if (table === 'notebook_conversations') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockResolvedValue({ data: config.conversations, error: null }),
      }
    }
    if (table === 'notebook_messages') {
      let isLatestQuery = false
      const builder: any = {
        select: vi.fn().mockReturnThis(),
        in: vi.fn((_column: string, ids: string[]) => {
          isLatestQuery = true
          config.capturedInIds = ids
          return builder
        }),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: config.latestMessage, error: null }),
        order: vi.fn((_column: string, _opts: unknown) => {
          if (isLatestQuery) {
            // .order(...).limit(1).maybeSingle() chain for the latest-message probe
            return builder
          }
          // .order(...) terminal call for the full message fetch
          return Promise.resolve({ data: config.storedMessages, error: null })
        }),
      }
      return builder
    }
    throw new Error(`Unexpected table in test: ${table}`)
  })
}

describe('qaStore.loadConversation: assistant message text fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useQAStore.setState({ messages: [], conversationId: null, loading: false, error: undefined })
  })

  it('falls back to the "no results" text when metadata.no_sufficient_context is true', async () => {
    mockSupabase({
      conversations: [{ id: 'conv-1' }],
      latestMessage: { conversation_id: 'conv-1' },
      storedMessages: [
        {
          id: 'msg-assistant-1',
          role: 'assistant',
          content: '',
          created_at: '2026-01-01T00:00:00Z',
          metadata: { no_sufficient_context: true, source_count: 0 },
          notebook_citations: [],
        },
      ],
    })

    await useQAStore.getState().loadConversation('project-1')

    const [message] = useQAStore.getState().messages
    expect(message.text).toBe(i18n.t('ui.qa.noResults'))
    expect(message.noSufficientContext).toBe(true)
  })

  it('falls back to the existing static-mode text when no_sufficient_context is not set', async () => {
    mockSupabase({
      conversations: [{ id: 'conv-1' }],
      latestMessage: { conversation_id: 'conv-1' },
      storedMessages: [
        {
          id: 'msg-assistant-2',
          role: 'assistant',
          content: '',
          created_at: '2026-01-01T00:00:00Z',
          metadata: { source_count: 3 },
          notebook_citations: [],
        },
      ],
    })

    await useQAStore.getState().loadConversation('project-1')

    const [message] = useQAStore.getState().messages
    expect(message.text).toBe(i18n.t('ui.qa.staticModeAnswer'))
    expect(message.noSufficientContext).toBe(false)
  })
})

describe('qaStore.loadConversation: conversation selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useQAStore.setState({ messages: [], conversationId: null, loading: false, error: undefined })
  })

  it('resets to a null conversation when no non-archived conversations exist', async () => {
    mockSupabase({ conversations: [], latestMessage: null, storedMessages: [] })

    await useQAStore.getState().loadConversation('project-1')

    const state = useQAStore.getState()
    expect(state.conversationId).toBeNull()
    expect(state.messages).toEqual([])
  })

  it('skips message-less conversations so a fresh question starts a new conversation', async () => {
    // A non-archived conversation row exists, but it has no messages (orphan row
    // left behind by a failed QA turn). The latest-message probe returns null.
    mockSupabase({
      conversations: [{ id: 'orphan-conv' }],
      latestMessage: null,
      storedMessages: [],
    })

    await useQAStore.getState().loadConversation('project-1')

    const state = useQAStore.getState()
    expect(state.conversationId).toBeNull()
    expect(state.messages).toEqual([])
  })

  it('resets to null when every candidate conversation is empty', async () => {
    mockSupabase({
      conversations: [{ id: 'empty-a' }, { id: 'empty-b' }, { id: 'empty-c' }],
      latestMessage: null,
      storedMessages: [],
    })

    await useQAStore.getState().loadConversation('project-1')

    const state = useQAStore.getState()
    expect(state.conversationId).toBeNull()
    expect(state.messages).toEqual([])
  })

  it('selects the conversation whose most recent message is newest', async () => {
    const config: MockConfig = {
      conversations: [{ id: 'conv-new' }, { id: 'conv-old' }],
      // The server-side .order('created_at', desc).limit(1) resolves this to the
      // conversation holding the newest message.
      latestMessage: { conversation_id: 'conv-old' },
      storedMessages: [
        {
          id: 'msg-user-1',
          role: 'user',
          content: 'Older conversation, newest activity',
          created_at: '2026-02-01T00:00:00Z',
          metadata: {},
          notebook_citations: [],
        },
        {
          id: 'msg-assistant-1',
          role: 'assistant',
          content: 'An answer',
          created_at: '2026-02-01T00:00:01Z',
          metadata: { source_count: 0 },
          notebook_citations: [],
        },
      ],
    }
    mockSupabase(config)

    await useQAStore.getState().loadConversation('project-1')

    const state = useQAStore.getState()
    expect(state.conversationId).toBe('conv-old')
    expect(state.messages.map((m) => m.text)).toEqual([
      'Older conversation, newest activity',
      'An answer',
    ])
    // The latest-message probe must be scoped to the candidate conversation ids.
    expect(config.capturedInIds?.sort()).toEqual(['conv-new', 'conv-old'])
  })
})
