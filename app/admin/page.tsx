import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase-server'
import AdminPanel from './AdminPanel'

export default async function AdminPage() {
  const session = await auth()
  if (session?.user?.email !== 'hoo000kr789@gmail.com') redirect('/')

  const sb = createServiceClient()
  const { data: requests } = await sb
    .from('access_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  return <AdminPanel initialRequests={requests ?? []} />
}
