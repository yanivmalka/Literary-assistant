import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useQuillStore } from '@/stores/quillStore'
import i18n from '@/i18n'

export interface QASource {
  chunkId: string
  content: string
  chapterNumber: number | null
  chapterTitle: string | null
  page: number | null
  position?: number
  versionId?: string
  score: number
  documentName?: string
  citationId?: string
}

export interface QAMessage {
  id: string
  type: 'question' | 'answer' | 'error'
  text: string
  sources?: QASource[]
  entitiesReferenced?: string[]
  noSufficientContext?: boolean
  timestamp: Date
}

interface QAState {
  messages: QAMessage[]
  conversationId: string | null
  selectedSourceVersionIds: string[]
  includeAdjacent: boolean
  loading: boolean
  error: string | null

  ask: (projectId: string, question: string) => Promise<void>
  loadConversation: (projectId: string) => Promise<void>
  deleteConversation: () => Promise<void>
  setSelectedSourceVersionIds: (versionIds: string[]) => void
  setIncludeAdjacent: (includeAdjacent: boolean) => void
}

interface QuillResponse {
  quills_balance: number
  token_remainder: number
}

interface EdgeFunctionResponse {
  success: boolean
  error?: string
  result?: {
    answer: string
    sources: QASource[]
    entitiesReferenced: string[]
    noSufficientContext: boolean
    conversationId?: string
    userMessageId?: string
    messageId?: string
    citationIds?: string[]
    quills?: QuillResponse
    usage?: {
      input_tokens: number | null
      output_tokens: number | null
      total_tokens: number
      charged_quills: number
    }
  }
}

export const useQAStore = create<QAState>((set, get) => ({
  messages: [],
  conversationId: null,
  selectedSourceVersionIds: [],
  includeAdjacent: true,
  loading: false,
  error: null,

  ask: async (projectId, question) => {
    const questionMsg: QAMessage = {
      id: crypto.randomUUID(),
      type: 'question',
      text: question,
      timestamp: new Date(),
    }
    set({ messages: [...get().messages, questionMsg], loading: true, error: null })

    try {
      // Get authenticated user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        const errorMsg: QAMessage = {
          id: crypto.randomUUID(),
          type: 'error',
          text: i18n.t('ui.qa.authRequired'),
          timestamp: new Date(),
        }
        set({ messages: [...get().messages, errorMsg], loading: false, error: 'Not authenticated' })
        return
      }

      // Get session token for authorization
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        const errorMsg: QAMessage = {
          id: crypto.randomUUID(),
          type: 'error',
          text: i18n.t('ui.qa.authRequired'),
          timestamp: new Date(),
        }
        set({ messages: [...get().messages, errorMsg], loading: false, error: 'No session token' })
        return
      }

      // Call ask-question Edge Function
      const edgeFunctionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ask-question`
      
      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: projectId,
          question: question.trim(),
          top_k: 5,
          conversation_id: get().conversationId,
          client_request_id: questionMsg.id,
          source_version_ids: get().selectedSourceVersionIds.length > 0
            ? get().selectedSourceVersionIds
            : undefined,
          include_adjacent: get().selectedSourceVersionIds.length > 0
            ? get().includeAdjacent
            : undefined,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
        throw new Error(errorData.error || `Edge Function error: HTTP ${response.status}`)
      }

      const data = await response.json() as EdgeFunctionResponse

      if (!data.success || !data.result) {
        const errorMessage = data.error === 'INSUFFICIENT_QUILLS'
          ? i18n.t('quills.insufficient')
          : (data.error || 'Edge Function returned invalid response')
        throw new Error(errorMessage)
      }

      const result = data.result
      if (result.conversationId) {
        set({ conversationId: result.conversationId })
      }
      if (result.quills) {
        useQuillStore.getState().applyServerWallet(result.quills)
      } else {
        await useQuillStore.getState().loadWallet()
      }

      // No context available
      if (result.noSufficientContext && !result.answer) {
        const noContextMsg: QAMessage = {
          id: result.messageId || crypto.randomUUID(),
          type: 'answer',
          text: i18n.t('ui.qa.noResults'),
          sources: result.sources,
          entitiesReferenced: result.entitiesReferenced,
          noSufficientContext: true,
          timestamp: new Date(),
        }
        set({ messages: [...get().messages, noContextMsg], loading: false })
        return
      }

      // Generate answer from LLM
      const answerMsg: QAMessage = {
        id: result.messageId || crypto.randomUUID(),
        type: 'answer',
        text: result.answer || i18n.t('ui.qa.staticModeAnswer'),
        sources: result.sources,
        entitiesReferenced: result.entitiesReferenced,
        noSufficientContext: result.noSufficientContext,
        timestamp: new Date(),
      }
      set({ messages: [...get().messages, answerMsg], loading: false })
    } catch (error) {
      console.error('Q&A error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const errorMsg: QAMessage = {
        id: crypto.randomUUID(),
        type: 'error',
        text: `${i18n.t('ui.qa.searchError')}: ${errorMessage}`,
        timestamp: new Date(),
      }
      set({ 
        messages: [...get().messages, errorMsg], 
        loading: false,
        error: errorMessage,
      })
    }
  },

  loadConversation: async (projectId) => {
    set({ loading: true, error: null })
    try {
      // Consider only non-archived conversations for this project, then pick the
      // one whose most recent message is newest. Selecting by the most recent
      // message (rather than notebook_conversations.updated_at) structurally
      // skips message-less conversation rows — e.g. orphan rows left behind when
      // a QA turn failed to persist after its conversation row was created — so
      // a fresh question after a deletion starts a new conversation instead of
      // silently resuming a stale empty one.
      const { data: candidateConversations, error: conversationError } = await supabase
        .from('notebook_conversations')
        .select('id')
        .eq('project_id', projectId)
        .is('archived_at', null)

      if (conversationError) throw conversationError

      const candidateIds = (candidateConversations ?? [])
        .map((row: { id: string }) => row.id)
        .filter(Boolean)

      if (candidateIds.length === 0) {
        set({ conversationId: null, messages: [], loading: false })
        return
      }

      const { data: latestMessage, error: latestMessageError } = await supabase
        .from('notebook_messages')
        .select('conversation_id')
        .in('conversation_id', candidateIds)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestMessageError) throw latestMessageError
      if (!latestMessage?.conversation_id) {
        set({ conversationId: null, messages: [], loading: false })
        return
      }

      const conversation = { id: latestMessage.conversation_id as string }

      const { data: storedMessages, error: messagesError } = await supabase
        .from('notebook_messages')
        .select(`
          id, role, content, created_at, metadata,
          notebook_citations (
            id, chunk_id, quote, page, chapter_number, chapter_title,
            chunk_position, retrieval_score,
            notebook_sources (title, version_id)
          )
        `)
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true })

      if (messagesError) throw messagesError

      const messages: QAMessage[] = (storedMessages ?? [])
        .filter((message: { role: string }) => message.role === 'user' || message.role === 'assistant')
        .map((message: any) => {
          const citations = Array.isArray(message.notebook_citations)
            ? message.notebook_citations
            : []
          const sources: QASource[] = citations.map((citation: any) => {
            const source = Array.isArray(citation.notebook_sources)
              ? citation.notebook_sources[0]
              : citation.notebook_sources
            return {
              chunkId: citation.chunk_id || citation.id,
              content: citation.quote || '',
              chapterNumber: citation.chapter_number ?? null,
              chapterTitle: citation.chapter_title ?? null,
              page: citation.page ?? null,
              position: citation.chunk_position ?? 0,
              versionId: source?.version_id,
              score: citation.retrieval_score ?? 0,
              documentName: source?.title,
              citationId: citation.id,
            }
          })
          const metadata = message.metadata && typeof message.metadata === 'object'
            ? message.metadata
            : {}
          return {
            id: message.id,
            type: message.role === 'user' ? 'question' : 'answer',
            text: message.role === 'assistant' && !message.content
              ? (metadata.no_sufficient_context === true
                  ? i18n.t('ui.qa.noResults')
                  : i18n.t('ui.qa.staticModeAnswer'))
              : message.content,
            sources,
            noSufficientContext: metadata.no_sufficient_context === true,
            timestamp: new Date(message.created_at),
          }
        })

      set({ conversationId: conversation.id, messages, loading: false })
    } catch (error) {
      console.warn('Notebook conversation unavailable; starting with local history', error)
      set({ conversationId: null, messages: [], loading: false })
    }
  },

  deleteConversation: async () => {
    const conversationId = get().conversationId
    if (!conversationId) {
      set({ messages: [], conversationId: null, error: null })
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      set({ error: 'Not authenticated' })
      return
    }

    const { error } = await supabase
      .from('notebook_conversations')
      .delete()
      .eq('id', conversationId)
      .eq('user_id', user.id)

    if (error) {
      console.error('Failed to delete Notebook conversation:', error)
      set({ error: error.message })
      return
    }

    set({ messages: [], conversationId: null, error: null })
  },

  setSelectedSourceVersionIds: (versionIds) => {
    set({ selectedSourceVersionIds: [...new Set(versionIds)] })
  },

  setIncludeAdjacent: (includeAdjacent) => set({ includeAdjacent }),
}))
