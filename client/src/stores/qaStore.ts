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
  loading: boolean
  error: string | null

  ask: (projectId: string, question: string) => Promise<void>
  loadConversation: (projectId: string) => Promise<void>
  clearHistory: () => void
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
      if (result.quills) {
        useQuillStore.getState().applyServerWallet(result.quills)
      } else {
        await useQuillStore.getState().loadWallet()
      }

      // No context available
      if (result.noSufficientContext && !result.answer) {
        const noContextMsg: QAMessage = {
          id: crypto.randomUUID(),
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
        id: crypto.randomUUID(),
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

  clearHistory: () => set({ messages: [], error: null }),
}))
