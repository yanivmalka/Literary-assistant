import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { CheckCircle, XCircle, Info, X } from 'lucide-react'

interface ToastMessage {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

interface ToastState {
  toasts: ToastMessage[]
  addToast: (type: ToastMessage['type'], message: string) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (type, message) => {
    const id = crypto.randomUUID()
    set((state) => ({ toasts: [...state.toasts, { id, type, message }] }))
    // Auto remove after 4 seconds
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) }))
    }, 4000)
  },
  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) }))
  },
}))

export function toast(type: ToastMessage['type'], message: string) {
  useToastStore.getState().addToast(type, message)
}

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 end-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onClose={() => removeToast(t.id)} />
      ))}
    </div>
  )
}

function ToastItem({ toast: t, onClose }: { toast: ToastMessage; onClose: () => void }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setShow(true))
  }, [])

  const Icon = t.type === 'success' ? CheckCircle : t.type === 'error' ? XCircle : Info
  const colorClass = t.type === 'success'
    ? 'border-success/30 bg-success-soft text-success'
    : t.type === 'error'
    ? 'border-destructive/30 bg-destructive/10 text-destructive'
    : 'border-info/30 bg-info-soft text-info'

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 border rounded-lg shadow-lg transition-all duration-300 ${colorClass} ${
        show ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <p className="text-sm flex-1">{t.message}</p>
      <button onClick={onClose} className="p-0.5 rounded hover:bg-black/5">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
