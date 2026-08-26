// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'

import '@/i18n'

const restoreFromTrash = vi.fn()
const deletePermanently = vi.fn()
const emptyTrash = vi.fn().mockResolvedValue({ success: true })
const fetchTrashedProjects = vi.fn()

const trashedProjects = [
  { id: 'project-1', name: 'Project One', deleted_at: new Date().toISOString() },
  { id: 'project-2', name: 'Project Two', deleted_at: new Date().toISOString() },
]

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: () => ({
    trashedProjects,
    loading: false,
    fetchTrashedProjects,
    restoreFromTrash,
    deletePermanently,
    emptyTrash,
  }),
}))

import TrashPage from '../TrashPage'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('TrashPage: permanent-delete confirmation flow (per project)', () => {
  it('clicking "Delete Permanently" only opens the dialog, does not delete', () => {
    render(<TrashPage />)
    const deleteButtons = screen.getAllByText('Delete Permanently')
    fireEvent.click(deleteButtons[0])
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(deletePermanently).not.toHaveBeenCalled()
  })

  it('Cancel closes the dialog without deleting', () => {
    render(<TrashPage />)
    fireEvent.click(screen.getAllByText('Delete Permanently')[0])
    fireEvent.click(screen.getByText('Cancel'))
    expect(deletePermanently).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Confirm deletes only the project that was clicked', () => {
    render(<TrashPage />)
    // Click delete on the second project.
    fireEvent.click(screen.getAllByText('Delete Permanently')[1])
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Permanently' }))
    expect(deletePermanently).toHaveBeenCalledTimes(1)
    expect(deletePermanently).toHaveBeenCalledWith('project-2')
  })
})

describe('TrashPage: empty-trash confirmation flow', () => {
  it('clicking "Empty Trash" only opens the dialog, does not empty', () => {
    render(<TrashPage />)
    fireEvent.click(screen.getByText('Empty Trash'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(emptyTrash).not.toHaveBeenCalled()
  })

  it('Escape closes the dialog without emptying', () => {
    render(<TrashPage />)
    fireEvent.click(screen.getByText('Empty Trash'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(emptyTrash).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Confirm calls emptyTrash', async () => {
    render(<TrashPage />)
    fireEvent.click(screen.getByText('Empty Trash'))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Empty Trash' }))
    expect(emptyTrash).toHaveBeenCalledTimes(1)
  })
})
