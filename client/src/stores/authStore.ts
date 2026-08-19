import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/types'
import type { User, Session } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  session: Session | null
  profile: Profile | null
  loading: boolean
  initialized: boolean

  initialize: () => Promise<void>
  signUp: (email: string, password: string) => Promise<{ error: string | null }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signInWithGoogle: () => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  fetchProfile: () => Promise<void>
  updateProfile: (updates: Partial<Profile>) => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  loading: false,
  initialized: false,

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (session) {
        set({ user: session.user, session, initialized: true })
        await get().fetchProfile()
      } else {
        set({ initialized: true })
      }

      // Listen for auth changes
      supabase.auth.onAuthStateChange(async (_event, session) => {
        set({ user: session?.user ?? null, session })
        if (session?.user) {
          await get().fetchProfile()
        } else {
          set({ profile: null })
        }
      })
    } catch (error) {
      console.warn('Auth initialization failed:', error)
      set({ initialized: true })
    }
  },

  signUp: async (email, password) => {
    set({ loading: true })
    const { error } = await supabase.auth.signUp({ email, password })
    set({ loading: false })
    return { error: error?.message ?? null }
  },

  signIn: async (email, password) => {
    set({ loading: true })
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    set({ loading: false })
    return { error: error?.message ?? null }
  },

  signInWithGoogle: async () => {
    const redirectUrl = `${window.location.origin}${import.meta.env.BASE_URL}`
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUrl },
    })
    return { error: error?.message ?? null }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null, profile: null })
  },

  fetchProfile: async () => {
    // profiles table removed - derive from auth user metadata
    const { user } = get()
    if (!user) return
    set({ profile: { id: user.id, email: user.email || "", display_name: user.email?.split("@")[0] || "", avatar_url: null, preferred_language: "he", created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as Profile })
  },

  updateProfile: async (_updates) => {
    // profiles table removed - no-op
    console.log("[Auth] updateProfile: profiles table not available")
  },
}))
