import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

console.log('🔍 [Supabase Init]', {
  supabaseUrl: supabaseUrl ? '✓ loaded' : '✗ empty',
  supabaseAnonKey: supabaseAnonKey ? `✓ loaded (length: ${supabaseAnonKey.length})` : '✗ empty',
  NODE_ENV: import.meta.env.MODE,
  ALL_ENV: Object.keys(import.meta.env).filter(k => k.startsWith('VITE_'))
})

let supabase: SupabaseClient

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase credentials not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env'
  )
  // Create a dummy client that won't crash the app
  supabase = createClient('https://placeholder.supabase.co', 'placeholder-key')
} else {
  supabase = createClient(supabaseUrl, supabaseAnonKey)
}

export { supabase }
