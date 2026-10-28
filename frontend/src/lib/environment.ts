export interface FrontendEnvironment {
  supabaseUrl: string
  supabaseAnonKey: string
  apiBaseUrl: string
}

function requireEnvironmentValue(name: string, value: string | undefined): string {
  const normalizedValue = value?.trim()
  if (!normalizedValue) {
    throw new Error(`${name} must be configured.`)
  }
  return normalizedValue
}

export function readEnvironment(environment: ImportMetaEnv): FrontendEnvironment {
  return {
    supabaseUrl: requireEnvironmentValue('VITE_SUPABASE_URL', environment.VITE_SUPABASE_URL),
    supabaseAnonKey: requireEnvironmentValue(
      'VITE_SUPABASE_ANON_KEY',
      environment.VITE_SUPABASE_ANON_KEY,
    ),
    apiBaseUrl: environment.VITE_API_BASE_URL?.trim() || '/api',
  }
}

export const frontendEnvironment = readEnvironment(import.meta.env)
