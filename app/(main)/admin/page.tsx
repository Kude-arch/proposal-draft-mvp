import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase-server'
import AdminPanel from './AdminPanel'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const session = await auth()
  if (session?.user?.email !== process.env.ADMIN_EMAIL) redirect('/')

  const sb = createServiceClient()
  const [{ data: requests }, { data: users }] = await Promise.all([
    sb.from('access_requests').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
    sb.from('allowed_users').select('id, email, created_at').order('created_at', { ascending: false }),
  ])

  return (
    <div className="flex flex-col min-h-full">
      <div className="sticky top-0 z-10 bg-[#F7F8FA] border-b border-[#F0F0EF] px-8 py-4">
        <h1 className="text-sm font-semibold text-gray-900">접근 요청 관리</h1>
        <p className="text-xs text-gray-400 mt-0.5">접근 권한을 관리하고 대기 중인 요청을 처리합니다</p>
      </div>
      <div className="px-8 py-6">
        <AdminPanel initialRequests={requests ?? []} initialUsers={users ?? []} />
      </div>
    </div>
  )
}
