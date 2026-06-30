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

  return (
    <div className="flex flex-col min-h-full">
      <div className="sticky top-0 z-10 bg-[#F7F8FA] border-b border-[#F0F0EF] px-8 py-4">
        <h1 className="text-sm font-semibold text-gray-900">접근 요청 관리</h1>
        <p className="text-xs text-gray-400 mt-0.5">대기 중인 접근 요청을 승인하거나 거절합니다</p>
      </div>
      <div className="px-8 py-6">
        <AdminPanel initialRequests={requests ?? []} />
      </div>
    </div>
  )
}
