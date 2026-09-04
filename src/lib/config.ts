function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const config = {
  supabase: {
    url: () => requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: () => requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    serviceRoleKey: () => requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  },
  asrProvider: process.env.ASR_PROVIDER || 'mock',
  translationProvider: process.env.TRANSLATION_PROVIDER || 'mock',
  webhookSecret: () => requireEnv('WEBHOOK_SECRET'),
  classification: {
    confidenceThreshold: 0.5,
    asrConfidenceThreshold: 0.6,
  },
} as const
