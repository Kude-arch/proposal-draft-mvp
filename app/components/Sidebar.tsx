'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Props {
  isAdmin: boolean
  pendingCount: number
  userEmail: string
}

export default function Sidebar({ isAdmin, pendingCount, userEmail }: Props) {
  const pathname = usePathname()

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/'
    return pathname.startsWith(path)
  }

  const navItem = (href: string, label: string, icon: React.ReactNode, badge?: number) => (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
        isActive(href)
          ? 'bg-[#EFF6FF] text-[#1D4ED8] font-medium'
          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
      }`}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="bg-red-100 text-red-600 text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none">
          {badge}
        </span>
      )}
    </Link>
  )

  return (
    <aside className="w-52 flex-shrink-0 bg-white border-r border-[#F0F0EF] flex flex-col h-screen sticky top-0 z-20">
      <div className="px-4 py-3.5 border-b border-[#F0F0EF]">
        <div className="text-sm font-semibold text-gray-900">제안서 자동생성</div>
        <div className="text-xs text-gray-400 mt-0.5">미래사업팀</div>
      </div>

      <nav className="flex-1 py-2 px-1.5 overflow-y-auto">
        <p className="text-[10px] font-medium tracking-widest text-gray-300 uppercase px-3 py-1.5">메뉴</p>

        {navItem('/', '제안서 목록',
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="flex-shrink-0">
            <rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/>
            <rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>
          </svg>
        )}

        {navItem('/items', '아이템 DB',
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="flex-shrink-0">
            <ellipse cx="8" cy="5" rx="6" ry="2"/>
            <path d="M2 5v3c0 1.1 2.7 2 6 2s6-.9 6-2V5"/>
            <path d="M2 8v3c0 1.1 2.7 2 6 2s6-.9 6-2V8"/>
          </svg>
        )}

        {isAdmin && (
          <>
            <p className="text-[10px] font-medium tracking-widest text-gray-300 uppercase px-3 py-1.5 mt-2">관리</p>
            {navItem('/admin', '접근 요청 관리',
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="flex-shrink-0">
                <circle cx="8" cy="6" r="3"/>
                <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/>
              </svg>,
              pendingCount
            )}
          </>
        )}
      </nav>

      <div className="border-t border-[#F0F0EF] px-3 py-2.5 flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-[10px] font-semibold flex-shrink-0">
          {/[a-zA-Z]/.test(userEmail.charAt(0))
            ? userEmail.charAt(0).toUpperCase()
            : userEmail.replace(/[^a-zA-Z]/g, '').charAt(0).toUpperCase() || 'U'}
        </div>
        <div className="text-[10px] text-gray-400 truncate">{userEmail}</div>
      </div>
    </aside>
  )
}
