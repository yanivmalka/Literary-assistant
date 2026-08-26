// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

// jsdom does not implement scrollIntoView; QAPanel calls it on message updates.
Element.prototype.scrollIntoView = vi.fn()

import '@/i18n'

const deleteConversation = vi.fn()
const loadConversation = vi.fn()
const ask = vi.fn()

vi.mock('@/stores/qaStore', () => ({
  useQAStore: () => ({
    messages: [
      { id: 'q1', type: 'question', text: 'Who is Leo?', timestamp: new Date() },
      { id: 'a1', type: 'answer', text: 'Leo is a character.', timestamp: new Date() },
    ],
    loading: false,
    ask,
    loadConversation,
    deleteConversation,
  }),
}))

import QAPanel from '../QAPanel'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('QAPanel: delete conversation confirmation flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('clicking the trash button only opens the dialog, does not delete', () => {
    render(<QAPanel projectId="project-1" />)
    fireEvent.click(screen.getByTitle('Clear history'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(deleteConversation).not.toHaveBeenCalled()
  })

  it('Cancel closes the dialog without calling deleteConversation', () => {
    render(<QAPanel projectId="project-1" />)
    fireEvent.click(screen.getByTitle('Clear history'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(deleteConversation).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Escape closes the dialog without calling deleteConversation', () => {
    render(<QAPanel projectId="project-1" />)
    fireEvent.click(screen.getByTitle('Clear history'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(deleteConversation).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('clicking the destructive Delete conversation button calls deleteConversation exactly once', () => {
    render(<QAPanel projectId="project-1" />)
    fireEvent.click(screen.getByTitle('Clear history'))
    fireEvent.click(screen.getByText('Delete conversation'))
    expect(deleteConversation).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
