import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

export interface QASource {
  chunkId: string
  content: string
  chapterNumber: number | null
  chapterTitle: string | null
  page: number | null
  score: number
  documentName?: string
}

export interface QAMessage {
  id: string
  type: 'question' | 'answer'
  text: string
  sources?: QASource[]
  entitiesReferenced?: string[]
  noSufficientContext?: boolean
  timestamp: Date
}

interface QAState {
  messages: QAMessage[]
  loading: boolean

  ask: (projectId: string, question: string) => Promise<void>
  clearHistory: () => void
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return {}
  return { 'Authorization': `Bearer ${session.access_token}` }
}

export const useQAStore = create<QAState>((set, get) => ({
  messages: [],
  loading: false,

  ask: async (projectId, question) => {
    const questionMsg: QAMessage = {
      id: crypto.randomUUID(),
      type: 'question',
      text: question,
      timestamp: new Date(),
    }
    set({ messages: [...get().messages, questionMsg], loading: true })

    try {
      const headers = await getAuthHeaders()
      const response = await fetch(`/api/projects/${projectId}/qa/ask`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })

      if (!response.ok) {
        const answerMsg: QAMessage = {
          id: crypto.randomUUID(),
          type: 'answer',
          text: 'Failed to get an answer. Please try again.',
          timestamp: new Date(),
        }
        set({ messages: [...get().messages, answerMsg], loading: false })
        return
      }

      const data = await response.json()

      const answerMsg: QAMessage = {
        id: crypto.randomUUID(),
        type: 'answer',
        text: data.answer || (data.noSufficientContext
          ? 'I could not find sufficient information in the document to answer this question.'
          : 'No answer generated. Relevant passages are shown below.'),
        sources: data.sources,
        entitiesReferenced: data.entitiesReferenced,
        noSufficientContext: data.noSufficientContext,
        timestamp: new Date(),
      }

      set({ messages: [...get().messages, answerMsg], loading: false })
    } catch (error) {
      const answerMsg: QAMessage = {
        id: crypto.randomUUID(),
        type: 'answer',
        text: 'An error occurred. Please try again.',
        timestamp: new Date(),
      }
      set({ messages: [...get().messages, answerMsg], loading: false })
    }
  },

  clearHistory: () => set({ messages: [] }),
}))
