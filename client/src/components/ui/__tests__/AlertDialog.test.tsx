// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { AlertDialog } from '../AlertDialog'

afterEach(() => {
  cleanup()
})

function renderDialog(overrides: Partial<React.ComponentProps<typeof AlertDialog>> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  const result = render(
    <AlertDialog
      open
      title="Delete conversation?"
      description="This cannot be undone."
      confirmLabel="Delete"
      cancelLabel="Cancel"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />
  )
  return { onConfirm, onCancel, ...result }
}

describe('AlertDialog', () => {
  it('renders nothing when closed', () => {
    render(
      <AlertDialog
        open={false}
        title="t"
        description="d"
        confirmLabel="c"
        cancelLabel="x"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is accessible: role="dialog" and aria-modal="true"', () => {
    renderDialog()
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })

  it('clicking Cancel calls onCancel and not onConfirm', () => {
    const { onConfirm, onCancel } = renderDialog()
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('clicking Confirm calls onConfirm and not onCancel', () => {
    const { onConfirm, onCancel } = renderDialog()
    fireEvent.click(screen.getByText('Delete'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('pressing Escape calls onCancel and not onConfirm', () => {
    const { onConfirm, onCancel } = renderDialog()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  describe('single-button "notice" mode (no onCancel, replaces window.alert)', () => {
    it('renders only the confirm button, no cancel button', () => {
      render(
        <AlertDialog
          open
          title="Notice"
          description="Name is required."
          confirmLabel="OK"
          onConfirm={vi.fn()}
        />
      )
      expect(screen.getByText('OK')).toBeTruthy()
      expect(screen.queryByText('Cancel')).toBeNull()
    })

    it('clicking the confirm button calls onConfirm', () => {
      const onConfirm = vi.fn()
      render(
        <AlertDialog
          open
          title="Notice"
          description="Name is required."
          confirmLabel="OK"
          onConfirm={onConfirm}
        />
      )
      fireEvent.click(screen.getByText('OK'))
      expect(onConfirm).toHaveBeenCalledTimes(1)
    })

    it('pressing Escape calls onConfirm (dismisses the notice)', () => {
      const onConfirm = vi.fn()
      render(
        <AlertDialog
          open
          title="Notice"
          description="Name is required."
          confirmLabel="OK"
          onConfirm={onConfirm}
        />
      )
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onConfirm).toHaveBeenCalledTimes(1)
    })
  })

  it('Escape is not seen by a parent document keydown listener (stopPropagation)', () => {
    const parentEscapeHandler = vi.fn()
    document.addEventListener('keydown', parentEscapeHandler)
    try {
      renderDialog()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(parentEscapeHandler).not.toHaveBeenCalled()
    } finally {
      document.removeEventListener('keydown', parentEscapeHandler)
    }
  })

  describe('focus management', () => {
    it('focuses the Cancel button when the dialog opens (two-button mode)', () => {
      renderDialog()
      expect(document.activeElement).toBe(screen.getByText('Cancel'))
    })

    it('focuses the Confirm button when the dialog opens (single-button "notice" mode)', () => {
      render(
        <AlertDialog
          open
          title="Notice"
          description="Name is required."
          confirmLabel="OK"
          onConfirm={vi.fn()}
        />
      )
      expect(document.activeElement).toBe(screen.getByText('OK'))
    })

    it('does not steal focus back when the parent re-renders with new onCancel/onConfirm identities while open', () => {
      const onConfirm1 = vi.fn()
      const onCancel1 = vi.fn()
      const { rerender } = render(
        <AlertDialog
          open
          title="Delete conversation?"
          description="This cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={onConfirm1}
          onCancel={onCancel1}
        />
      )
      const confirmButton = screen.getByText('Delete')
      confirmButton.focus()
      expect(document.activeElement).toBe(confirmButton)

      // Simulate a parent re-render passing brand-new callback identities
      // (as every migrated call site does with inline arrow functions).
      const onConfirm2 = vi.fn()
      const onCancel2 = vi.fn()
      rerender(
        <AlertDialog
          open
          title="Delete conversation?"
          description="This cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={onConfirm2}
          onCancel={onCancel2}
        />
      )

      expect(document.activeElement).toBe(confirmButton)
    })

    it('re-focuses Cancel on a genuine close -> open transition', () => {
      const { rerender } = render(
        <AlertDialog
          open={false}
          title="t"
          description="d"
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      )
      rerender(
        <AlertDialog
          open
          title="t"
          description="d"
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      )
      expect(document.activeElement).toBe(screen.getByText('Cancel'))
    })
  })

  describe('focus trap', () => {
    it('Tab from the last focusable element wraps back to the first', () => {
      renderDialog()
      const cancelButton = screen.getByText('Cancel')
      const confirmButton = screen.getByText('Delete')
      confirmButton.focus()
      expect(document.activeElement).toBe(confirmButton)

      fireEvent.keyDown(document, { key: 'Tab' })
      expect(document.activeElement).toBe(cancelButton)
    })

    it('Shift+Tab from the first focusable element wraps back to the last', () => {
      renderDialog()
      const cancelButton = screen.getByText('Cancel')
      const confirmButton = screen.getByText('Delete')
      expect(document.activeElement).toBe(cancelButton)

      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
      expect(document.activeElement).toBe(confirmButton)
    })

    it('Tab does not move focus outside the dialog', () => {
      renderDialog()
      const outsideButton = document.createElement('button')
      outsideButton.textContent = 'Outside'
      document.body.appendChild(outsideButton)
      try {
        const confirmButton = screen.getByText('Delete')
        confirmButton.focus()
        fireEvent.keyDown(document, { key: 'Tab' })
        expect(document.activeElement).not.toBe(outsideButton)
      } finally {
        outsideButton.remove()
      }
    })
  })
})
