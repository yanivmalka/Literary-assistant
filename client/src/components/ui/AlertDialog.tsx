import { useEffect, useRef } from 'react'
import { Button, type ButtonVariant } from './Button'

export interface AlertDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  /** Omit for a single-button "notice" dialog (replaces window.alert()). */
  cancelLabel?: string
  onCancel?: () => void
  /** Confirm button style. Defaults to 'destructive' for backward compatibility with the original delete-confirmation use case. */
  variant?: 'destructive' | 'default'
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
}

/**
 * Small reusable dialog for confirmations and notices, replacing
 * window.confirm()/window.alert(). Two-button mode (onCancel provided)
 * focuses Cancel by default so it stays the safe default action; single-
 * button "notice" mode (onCancel omitted) focuses the sole Confirm button.
 */
export function AlertDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  cancelLabel,
  onCancel,
  variant = 'destructive',
}: AlertDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const hasCancel = Boolean(onCancel)

  // Kept current without being an effect dependency, so a caller passing a
  // fresh inline onConfirm/onCancel each render doesn't retrigger the
  // open-transition effect below (which would steal focus back).
  const onConfirmRef = useRef(onConfirm)
  onConfirmRef.current = onConfirm
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  useEffect(() => {
    if (!open) return
    // Runs only on the closed -> open transition (deps: [open] only), so
    // subsequent parent re-renders while the dialog stays open don't
    // re-focus the button out from under the user.
    ;(onCancelRef.current ? cancelButtonRef : confirmButtonRef).current?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        // Capture phase (below) + stopPropagation so this dialog's Escape
        // is consumed here, not by a parent modal's own bubble-phase
        // document keydown listener (which would otherwise also close the
        // modal the dialog is layered on top of).
        e.stopPropagation()
        ;(onCancelRef.current ?? onConfirmRef.current)()
        return
      }

      if (e.key === 'Tab') {
        const container = panelRef.current
        if (!container) return
        const focusable = getFocusableElements(container)
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        const active = document.activeElement

        if (e.shiftKey) {
          if (active === first || !container.contains(active)) {
            e.preventDefault()
            last.focus()
          }
        } else if (active === last || !container.contains(active)) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [open])

  if (!open) return null

  const confirmVariant: ButtonVariant = variant === 'destructive' ? 'destructive' : 'primary'
  const dismiss = onCancel ?? onConfirm

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-description"
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={dismiss} />

      {/* Dialog */}
      <div ref={panelRef} className="relative w-full max-w-sm bg-card border border-border rounded-lg shadow-xl mx-4 z-10 p-6">
        <h2 id="alert-dialog-title" className="text-base font-display font-semibold">
          {title}
        </h2>
        <p id="alert-dialog-description" className="text-sm text-muted-foreground mt-2">
          {description}
        </p>
        <div className="flex items-center justify-end gap-2 mt-6">
          {hasCancel && (
            <Button ref={cancelButtonRef} variant="secondary" size="sm" onClick={onCancel}>
              {cancelLabel}
            </Button>
          )}
          <Button
            ref={hasCancel ? undefined : confirmButtonRef}
            variant={confirmVariant}
            size="sm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
