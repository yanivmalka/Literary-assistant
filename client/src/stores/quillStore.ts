import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

export const QUILL_TOKEN_SIZE = 5000

export interface QuillWallet {
  user_id: string
  quills_balance: number
  token_remainder: number
}

export interface QuillBalancePayload {
  quills_balance: number
  token_remainder: number
}

export interface QuillUsagePayload {
  total_tokens: number
  charged_quills: number
  quills_balance: number
  token_remainder: number
}

interface QuillState {
  wallet: QuillWallet | null
  loading: boolean
  granting: boolean
  error: string | null
  loadWallet: () => Promise<void>
  applyServerWallet: (payload: QuillBalancePayload) => void
  grantQuills: (amount: 20 | 50 | 100) => Promise<boolean>
  clear: () => void
}

export const useQuillStore = create<QuillState>((set) => ({
  wallet: null,
  loading: false,
  granting: false,
  error: null,

  loadWallet: async () => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase.rpc('get_quill_wallet')
      if (error) throw error
      const wallet = Array.isArray(data) ? data[0] : data
      set({ wallet: wallet ?? null, loading: false })
    } catch (error) {
      console.error('[Quills] Failed to load wallet:', error)
      set({ loading: false, error: 'quills.loadError' })
    }
  },

  applyServerWallet: (payload) => {
    if (!Number.isFinite(payload.quills_balance) || !Number.isFinite(payload.token_remainder)) return
    set((state) => ({
      wallet: state.wallet
        ? { ...state.wallet, ...payload }
        : { user_id: '', ...payload },
      loading: false,
      error: null,
    }))
  },

  grantQuills: async (amount) => {
    set({ granting: true, error: null })
    try {
      const { data, error } = await supabase.rpc('grant_demo_quills', {
        p_amount: amount,
        p_package: String(amount),
      })
      if (error) throw error
      const wallet = Array.isArray(data) ? data[0] : data
      if (!wallet) throw new Error('The wallet response was empty')
      set((state) => ({
        granting: false,
        wallet: state.wallet
          ? { ...state.wallet, ...wallet }
          : { user_id: '', ...wallet },
      }))
      return true
    } catch (error) {
      console.error('[Quills] Failed to grant Quills:', error)
      set({ granting: false, error: 'quills.purchaseError' })
      return false
    }
  },

  clear: () => set({ wallet: null, loading: false, granting: false, error: null }),
}))
