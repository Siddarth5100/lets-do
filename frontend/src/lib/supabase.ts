import { createClient } from '@supabase/supabase-js'
import { frontendEnvironment } from './environment'

export const supabase = createClient(
  frontendEnvironment.supabaseUrl,
  frontendEnvironment.supabaseAnonKey,
  {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  },
)
