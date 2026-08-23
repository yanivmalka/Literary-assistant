import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import i18n from '@/i18n'
import type { Profile } from '@/lib/types'
import type { User, Session } from '@supabase/supabase-js'

type AuthError = { code?: string; message?: string } | null

function translateAuthError(error: AuthError, fallbackKey: string) {
  const code = error?.code?.toLowerCase()
  const message = error?.message?.toLowerCase() || ''

  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return i18n.t('auth.emailNotConfirmed')
  }
  if (code === 'invalid_credentials' || code === 'invalid_grant') {
    return i18n.t('auth.invalidCredentials')
  }
  return i18n.t(fallbackKey)
}

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
  confirmEmail: (email: string, token: string) => Promise<{ error: string | null }>
  linkIdentity: (provider: 'google' | 'github') => Promise<{ error: string | null }>
  updateUserPassword: (password: string) => Promise<{ error: string | null }>
  getUserIdentities: () => Promise<{ identities: any[] | null; error: string | null }>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  loading: false,
  initialized: false,

  initialize: async () => {
    try {
      // First, get the current session from Supabase
      const { data: { session } } = await supabase.auth.getSession()

      if (session) {
        // Session exists - set user and fetch profile
        set({ user: session.user, session, initialized: true })
        await get().fetchProfile()
      } else {
        // No session yet - just mark as initialized
        // The auth listener below will pick up the session when it's established
        set({ initialized: true })
      }

      // Set up a persistent listener for auth state changes
      // This will handle login, logout, and token refresh
      supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          // User signed in or token was refreshed - update state and fetch profile
          set({ user: session?.user ?? null, session })
          if (session?.user) {
            await get().fetchProfile()
          }
        } else if (event === 'SIGNED_OUT') {
          // User signed out - clear state
          set({ user: null, session: null, profile: null })
        }
      })
    } catch (error) {
      console.error('Auth initialization failed:', error)
      set({ initialized: true })
    }
  },

  signUp: async (email, password) => {
    set({ loading: true })
    try {
      const normalizedEmail = email.trim()
      if (!normalizedEmail || !password) {
        set({ loading: false })
        return { error: i18n.t('auth.emailRequired') }
      }

      const { error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
        }
      })
      set({ loading: false })
      return { error: error ? translateAuthError(error, 'auth.signUpFailed') : null }
    } catch (err) {
      set({ loading: false })
      console.error('Sign up failed:', err)
      return { error: i18n.t('auth.signUpFailed') }
    }
  },

  signIn: async (email, password) => {
    set({ loading: true })
    try {
      const normalizedEmail = email.trim()
      if (!normalizedEmail || !password) {
        set({ loading: false })
        return { error: i18n.t('auth.emailRequired') }
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      })

      if (error) {
        set({ loading: false })
        const translatedError = translateAuthError(error, 'auth.signInFailed')
        return { error: translatedError }
      }

      // Wait for the auth session to be established and listener to fire
      // This ensures the user state is updated before returning
      await new Promise(resolve => {
        const timeout = setTimeout(resolve, 500) // 500ms to allow listener to fire
        
        // Listen for the next auth state change
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          if (event === 'SIGNED_IN' && session?.user) {
            clearTimeout(timeout)
            subscription.unsubscribe()
            resolve(null)
          }
        })
      })

      set({ loading: false })
      return { error: null }
    } catch (err) {
      set({ loading: false })
      console.error('Sign in failed:', err)
      return { error: i18n.t('auth.signInFailed') }
    }
  },

  signInWithGoogle: async () => {
    const redirectUrl = `${window.location.origin}${import.meta.env.BASE_URL}`
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUrl },
    })
    return { error: error ? translateAuthError(error, 'auth.signInFailed') : null }
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

  confirmEmail: async (email, token) => {
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'signup',
      })
      return { error: error ? translateAuthError(error, 'auth.emailConfirmationFailed') : null }
    } catch (err) {
      console.error('Email confirmation failed:', err)
      return { error: i18n.t('auth.emailConfirmationFailed') }
    }
  },

  linkIdentity: async (provider) => {
    try {
      const redirectUrl = `${window.location.origin}${import.meta.env.BASE_URL}`
      const { error } = await supabase.auth.linkIdentity({
        provider,
        options: {
          redirectTo: redirectUrl,
        },
      })
      return { error: error ? translateAuthError(error, 'ui.common.unexpectedError') : null }
    } catch (err) {
      console.error(`Failed to link ${provider}:`, err)
      return { error: i18n.t('ui.common.unexpectedError') }
    }
  },

  updateUserPassword: async (password) => {
    try {
      const { error } = await supabase.auth.updateUser({ password })
      return { error: error ? translateAuthError(error, 'auth.passwordUpdateFailed') : null }
    } catch (err) {
      console.error('Failed to update password:', err)
      return { error: i18n.t('auth.passwordUpdateFailed') }
    }
  },

  getUserIdentities: async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        return { identities: null, error: i18n.t('auth.userNotFound') }
      }
      return { identities: user.identities ?? [], error: null }
    } catch (err) {
      console.error('Failed to fetch identities:', err)
      return { identities: null, error: i18n.t('auth.identitiesFetchFailed') }
    }
  },
}))
