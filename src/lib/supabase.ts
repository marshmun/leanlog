import { createBrowserClient } from '@supabase/ssr'

// SSR-aware browser client — auth session handled via cookies automatically.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
