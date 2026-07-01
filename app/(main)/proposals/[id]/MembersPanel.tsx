'use client'

import { useState, useEffect, useCallback } from 'react'

interface Member {
  id: string
  user_email: string
  role: string
  invited_by: string | null
  created_at: string
}

interface MembersData {
  owner_email: string | null
  members: Member[]
  my_access: 'owner' | 'member' | null
}

export default function MembersPanel({ proposalId }: { proposalId: string }) {
  const [data, setData] = useState<MembersData | null>(null)
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/proposals/${proposalId}/members`)
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [proposalId])

  useEffect(() => { load() }, [load])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setInviting(true)
    setError('')
    const res = await fetch(`/api/proposals/${proposalId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail.trim() }),
    })
    if (res.ok) {
      setInviteEmail('')
      await load()
    } else {
      const d = await res.json()
      setError(d.error ?? '초대 실패')
    }
    setInviting(false)
  }

  async function handleRemove(email: string) {
    setRemoving(email)
    setError('')
    const res = await fetch(`/api/proposals/${proposalId}/members`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (res.ok) {
      await load()
    } else {
      const d = await res.json()
      setError(d.error ?? '제거 실패')
    }
    setRemoving(null)
  }

  if (loading) return <div className="text-xs text-gray-400 p-2">로드 중...</div>
  if (!data) return null

  const isOwner = data.my_access === 'owner'

  return (
    <div className="border border-gray-200 rounded-xl bg-white p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">공유 멤버 관리</h3>

      {/* 소유자 */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
          <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">소유자</span>
          <span className="text-sm text-gray-700 flex-1 truncate">{data.owner_email ?? '(미설정)'}</span>
        </div>

        {/* 멤버 목록 */}
        {data.members.map(m => (
          <div key={m.id} className="flex items-center gap-2 px-3 py-2 border border-gray-100 rounded-lg">
            <span className="text-[10px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded">편집자</span>
            <span className="text-sm text-gray-700 flex-1 truncate">{m.user_email}</span>
            {(isOwner || data.my_access === 'member') && (
              <button
                onClick={() => handleRemove(m.user_email)}
                disabled={removing === m.user_email}
                className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50 flex-shrink-0"
                title="제거"
              >
                {removing === m.user_email ? '...' : '제거'}
              </button>
            )}
          </div>
        ))}

        {data.members.length === 0 && (
          <p className="text-xs text-gray-400 px-1">공유된 멤버가 없습니다</p>
        )}
      </div>

      {/* 초대 폼 (소유자만) */}
      {isOwner && (
        <form onSubmit={handleInvite} className="space-y-2">
          <label className="block text-xs font-medium text-gray-600">이메일로 초대</label>
          <div className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="example@email.com"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 min-w-0"
            />
            <button
              type="submit"
              disabled={inviting || !inviteEmail.trim()}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50 flex-shrink-0"
            >
              {inviting ? '...' : '초대'}
            </button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </form>
      )}
    </div>
  )
}
