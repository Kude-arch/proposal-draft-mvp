import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(url, anon)

// 서버사이드 전용 (API routes) — service_role 키로 RLS 우회
export function createServerClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  return createClient(url, serviceKey ?? anon, {
    auth: { persistSession: false },
  })
}
