import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, Loader2, Trash2 } from 'lucide-react'
import { useQAStore } from '@/stores/qaStore'
import SourceReference from './SourceReference'

interface QAPanelProps {
  projectId: string
}

export default function QAPanel({ projectId }: QAPanelProps) {
  const { t } = useTranslation()
  const { messages, loading, ask, clearHistory } = useQAStore()
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || loading) return
    ask(projectId, input.trim())
    setInput('')
  }

  return (
    <div className="flex flex-col h-full max-h-[600px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <h3 className="text-sm font-semibold">{t('qa.title')}</h3>
        {messages.length > 0 && (
          <button
            onClick={clearHistory}
            className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
            title={t('qa.clearHistory')}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground py-8">
            <p className="text-sm">{t('qa.placeholder')}</p>
            <p className="text-xs mt-1 opacity-70">{t('qa.examples')}</p>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`${msg.type === 'question' ? 'flex justify-end' : ''}`}>
            {msg.type === 'question' ? (
              <div className="bg-primary text-primary-foreground rounded-lg px-3 py-2 max-w-[80%]">
                <p className="text-sm">{msg.text}</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="bg-muted rounded-lg px-3 py-2">
                  <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                </div>
                {msg.sources && msg.sources.length > 0 && (
                  <div className="space-y-1 ps-2">
                    <p className="text-xs text-muted-foreground font-medium">{t('qa.sources')}:</p>
                    {msg.sources.map((source, idx) => (
                      <SourceReference key={source.chunkId} source={source} index={idx} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">{t('qa.thinking')}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t flex gap-2">
        <input
          id="qa-input"
          name="qa-input"
          type="text"
          value={input}
          autoComplete="off"
          onChange={e => setInput(e.target.value)}
          placeholder={t('qa.inputPlaceholder')}
          className="flex-1 px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="px-3 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  )
}
