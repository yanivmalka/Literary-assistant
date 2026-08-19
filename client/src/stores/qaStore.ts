import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import i18n from '@/i18n'

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
      // Direct Supabase full-text search (basic Q&A without LLM)
      // This works on static hosting. Full AI-powered Q&A requires the Express server.
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        set({ loading: false })
        return
      }

      // Get project documents
      const { data: docs } = await supabase
        .from('documents')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', user.id)

      if (!docs || docs.length === 0) {
        const noDocsMsg: QAMessage = {
          id: crypto.randomUUID(),
          type: 'answer',
          text: i18n.t('ui.qa.noDocuments'),
          noSufficientContext: true,
          timestamp: new Date(),
        }
        set({ messages: [...get().messages, noDocsMsg], loading: false })
        return
      }

      const docIds = docs.map(d => d.id)

      // Get versions
      const { data: versions } = await supabase
        .from('document_versions')
        .select('id')
        .in('document_id', docIds)
        .in('status', ['ready', 'indexed', 'skipped_no_provider'])

      if (!versions || versions.length === 0) {
        const notReadyMsg: QAMessage = {
          id: crypto.randomUUID(),
          type: 'answer',
          text: i18n.t('ui.qa.processing'),
          noSufficientContext: true,
          timestamp: new Date(),
        }
        set({ messages: [...get().messages, notReadyMsg], loading: false })
        return
      }

      const versionIds = versions.map(v => v.id)

      // Full-text search in chunks
      const { data: chunks } = await supabase
        .from('document_chunks')
        .select('id, content, chapter_number, chapter_title, page, position, version_id')
        .in('version_id', versionIds)
        .textSearch('content', question.split(' ').filter(w => w.length > 2).join(' & '), {
          type: 'plain',
          config: 'simple',
        })
        .limit(5)

      const sources: QASource[] = (chunks || []).map(chunk => ({
        chunkId: chunk.id,
        content: chunk.content,
        chapterNumber: chunk.chapter_number,
        chapterTitle: chunk.chapter_title,
        page: chunk.page,
        score: 1,
        documentName: undefined,
      }))

      if (sources.length === 0) {
        const noResultsMsg: QAMessage = {
          id: crypto.randomUUID(),
          type: 'answer',
          text: i18n.t('ui.qa.noResults'),
          sources: [],
          noSufficientContext: true,
          timestamp: new Date(),
        }
        set({ messages: [...get().messages, noResultsMsg], loading: false })
        return
      }

      // Without LLM: show relevant sources directly
      const answerMsg: QAMessage = {
        id: crypto.randomUUID(),
        type: 'answer',
        text: i18n.t('ui.qa.staticModeAnswer'),
        sources,
        noSufficientContext: false,
        timestamp: new Date(),
      }
      set({ messages: [...get().messages, answerMsg], loading: false })
    } catch (error) {
      console.error('Q&A error:', error)
      const errorMsg: QAMessage = {
        id: crypto.randomUUID(),
        type: 'answer',
        text: i18n.t('ui.qa.searchError'),
        timestamp: new Date(),
      }
      set({ messages: [...get().messages, errorMsg], loading: false })
    }
  },

  clearHistory: () => set({ messages: [] }),
}))
