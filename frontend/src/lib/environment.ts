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

function requireProductionUrl(name: string, value: string | undefined, requiredPath?: string): string {
  const normalizedValue = requireEnvironmentValue(name, value)
  let parsedUrl: URL
  try {
    parsedUrl = new URL(normalizedValue)
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`)
  }

  if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
    throw new Error(`${name} must be a credential-free HTTPS URL.`)
  }
  if (requiredPath && parsedUrl.pathname.replace(/\/$/, '') !== requiredPath) {
    throw new Error(`${name} must use the ${requiredPath} path.`)
  }
  if (parsedUrl.search || parsedUrl.hash) {
    throw new Error(`${name} must not include a query string or fragment.`)
  }
  return normalizedValue
}

export function readEnvironment(environment: ImportMetaEnv): FrontendEnvironment {
  if (environment.PROD) {
    return {
      supabaseUrl: requireProductionUrl('VITE_SUPABASE_URL', environment.VITE_SUPABASE_URL),
      supabaseAnonKey: requireEnvironmentValue(
        'VITE_SUPABASE_ANON_KEY',
        environment.VITE_SUPABASE_ANON_KEY,
      ),
      apiBaseUrl: requireProductionUrl(
        'VITE_API_BASE_URL',
        environment.VITE_API_BASE_URL,
        '/api',
      ),
    }
  }

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
