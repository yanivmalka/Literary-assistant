import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Regression test for the Notebook rehydration bug: an assistant message with
 * empty `content` must fall back to the "no results" text when
 * metadata.no_sufficient_context is true, and to the existing static-mode
 * fallback text otherwise.
 */

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

import { supabase } from '@/lib/supabase'
import i18n from '@/i18n'
import { useQAStore } from '@/stores/qaStore'

function mockConversationAndMessages(storedMessages: unknown[]) {
  ;(supabase.from as any).mockImplementation((table: string) => {
    if (table === 'notebook_conversations') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'conv-1' }, error: null }),
      }
    }
    if (table === 'notebook_messages') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: storedMessages, error: null }),
      }
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
    mockConversationAndMessages([
      {
        id: 'msg-assistant-1',
        role: 'assistant',
        content: '',
        created_at: '2026-01-01T00:00:00Z',
        metadata: { no_sufficient_context: true, source_count: 0 },
        notebook_citations: [],
      },
    ])

    await useQAStore.getState().loadConversation('project-1')

    const [message] = useQAStore.getState().messages
    expect(message.text).toBe(i18n.t('ui.qa.noResults'))
    expect(message.noSufficientContext).toBe(true)
  })

  it('falls back to the existing static-mode text when no_sufficient_context is not set', async () => {
    mockConversationAndMessages([
      {
        id: 'msg-assistant-2',
        role: 'assistant',
        content: '',
        created_at: '2026-01-01T00:00:00Z',
        metadata: { source_count: 3 },
        notebook_citations: [],
      },
    ])

    await useQAStore.getState().loadConversation('project-1')

    const [message] = useQAStore.getState().messages
    expect(message.text).toBe(i18n.t('ui.qa.staticModeAnswer'))
    expect(message.noSufficientContext).toBe(false)
  })
})
