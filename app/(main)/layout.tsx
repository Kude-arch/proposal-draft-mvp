import { auth } from '@/auth'
import { createServiceClient } from '@/lib/supabase-server'
import Sidebar from '@/app/components/Sidebar'

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  const isAdmin = session?.user?.email === 'hoo000kr789@gmail.com'

  let pendingCount = 0
  if (isAdmin) {
    const sb = createServiceClient()
    const { count } = await sb
      .from('access_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    pendingCount = count ?? 0
  }

  return (
    <div className="flex h-screen bg-[#F7F8FA] overflow-hidden">
      <Sidebar
        isAdmin={isAdmin}
        pendingCount={pendingCount}
        userEmail={session?.user?.email ?? ''}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
