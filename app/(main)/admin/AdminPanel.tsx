'use client'

import { useState } from 'react'

type Request = { id: string; name: string; email: string; created_at: string }
type AllowedUser = { id: string; email: string; created_at: string }

interface Props {
  initialRequests: Request[]
  initialUsers: AllowedUser[]
}

export default function AdminPanel({ initialRequests, initialUsers }: Props) {
  const [requests, setRequests] = useState<Request[]>(initialRequests)
  const [users, setUsers] = useState<AllowedUser[]>(initialUsers)
  const [reqLoading, setReqLoading] = useState<string | null>(null)
  const [userLoading, setUserLoading] = useState<string | null>(null)
  const [addEmail, setAddEmail] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState('')

  async function handleRequest(id: string, action: 'approve' | 'reject') {
    setReqLoading(id)
    const res = await fetch(`/api/admin/requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    if (res.ok && action === 'approve') {
      // 승인된 경우 허용 사용자 목록도 갱신
      const approved = requests.find(r => r.id === id)
      if (approved) {
        const usersRes = await fetch('/api/admin/users')
        const updated = await usersRes.json()
        setUsers(updated)
      }
    }
    setRequests(prev => prev.filter(r => r.id !== id))
    setReqLoading(null)
  }

  async function handleRevoke(userId: string) {
    if (!confirm('이 사용자의 접근 권한을 삭제하시겠습니까?')) return
    setUserLoading(userId)
    const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
    if (res.ok) {
      setUsers(prev => prev.filter(u => u.id !== userId))
    }
    setUserLoading(null)
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault()
    const email = addEmail.trim().toLowerCase()
    if (!email) return
    setAddLoading(true)
    setAddError('')
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (res.ok) {
      const newUser = await res.json()
      setUsers(prev => {
        if (prev.some(u => u.id === newUser.id)) return prev
        return [newUser, ...prev]
      })
      setAddEmail('')
    } else {
      const data = await res.json()
      setAddError(data.error ?? '추가 실패')
    }
    setAddLoading(false)
  }

  return (
    <div className="max-w-2xl space-y-10">
      {/* ── 허용된 사용자 관리 ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">접근 허용 사용자</h2>
            <p className="text-xs text-gray-400 mt-0.5">현재 접근 권한이 있는 사용자 목록입니다</p>
          </div>
          <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full">
            {users.length}명
          </span>
        </div>

        {/* 직접 추가 폼 */}
        <form onSubmit={handleAddUser} className="flex gap-2 mb-4">
          <input
            type="email"
            value={addEmail}
            onChange={e => setAddEmail(e.target.value)}
            placeholder="이메일 입력 후 직접 추가"
            className="flex-1 border border-[#F0F0EF] rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 bg-white"
          />
          <button
            type="submit"
            disabled={addLoading || !addEmail.trim()}
            className="bg-[#2563EB] text-white text-xs px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {addLoading ? '추가 중...' : '+ 추가'}
          </button>
        </form>
        {addError && (
          <p className="text-xs text-red-500 mb-3 -mt-2">{addError}</p>
        )}

        {users.length === 0 ? (
          <div className="bg-white border border-[#F0F0EF] rounded-xl p-8 text-center text-sm text-gray-400">
            허용된 사용자가 없습니다
          </div>
        ) : (
          <div className="space-y-2">
            {users.map(u => (
              <div key={u.id} className="bg-white border border-[#F0F0EF] rounded-xl px-5 py-3.5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">{u.email}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(u.created_at).toLocaleDateString('ko-KR')} 부터
                  </p>
                </div>
                <button
                  onClick={() => handleRevoke(u.id)}
                  disabled={userLoading === u.id}
                  className="text-xs text-red-400 border border-red-100 rounded-md px-3 py-1.5 hover:bg-red-50 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {userLoading === u.id ? '처리 중...' : '권한 삭제'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 대기 중 요청 ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">대기 중인 접근 요청</h2>
            <p className="text-xs text-gray-400 mt-0.5">승인하면 해당 이메일에 즉시 접근 권한이 부여됩니다</p>
          </div>
          {requests.length > 0 && (
            <span className="bg-red-50 text-red-600 text-xs font-semibold px-2.5 py-1 rounded-full">
              {requests.length}건
            </span>
          )}
        </div>

        {requests.length === 0 ? (
          <div className="bg-white border border-[#F0F0EF] rounded-xl p-8 text-center">
            <p className="text-sm text-gray-400">대기 중인 요청이 없습니다</p>
          </div>
        ) : (
          <div className="space-y-2">
            {requests.map(r => (
              <div key={r.id} className="bg-white border border-[#F0F0EF] rounded-xl px-5 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">{r.name}</p>
                  <p className="text-xs text-gray-500">{r.email}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{new Date(r.created_at).toLocaleString('ko-KR')}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleRequest(r.id, 'approve')}
                    disabled={reqLoading === r.id}
                    className="bg-[#2563EB] text-white text-xs px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    승인
                  </button>
                  <button
                    onClick={() => handleRequest(r.id, 'reject')}
                    disabled={reqLoading === r.id}
                    className="bg-white text-gray-600 border border-[#F0F0EF] text-xs px-3 py-1.5 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    거절
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
