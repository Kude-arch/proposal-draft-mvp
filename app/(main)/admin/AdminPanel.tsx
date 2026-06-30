'use client'

import { useState } from 'react'

type Request = { id: string; name: string; email: string; created_at: string }

export default function AdminPanel({ initialRequests }: { initialRequests: Request[] }) {
  const [requests, setRequests] = useState<Request[]>(initialRequests)
  const [loading, setLoading] = useState<string | null>(null)

  async function handle(id: string, action: 'approve' | 'reject') {
    setLoading(id)
    await fetch(`/api/admin/requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    setRequests((prev) => prev.filter((r) => r.id !== id))
    setLoading(null)
  }

  if (requests.length === 0) {
    return (
      <div className="bg-white border border-[#F0F0EF] rounded-xl p-12 text-center">
        <div className="text-3xl mb-3">✅</div>
        <p className="text-gray-500 text-sm">대기 중인 요청이 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-3">
      {requests.map((r) => (
        <div key={r.id} className="bg-white border border-[#F0F0EF] rounded-xl px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="font-medium text-gray-900 text-sm">{r.name}</p>
            <p className="text-gray-500 text-xs">{r.email}</p>
            <p className="text-gray-400 text-xs mt-0.5">{new Date(r.created_at).toLocaleString('ko-KR')}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => handle(r.id, 'approve')}
              disabled={loading === r.id}
              className="bg-[#2563EB] text-white text-xs px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              승인
            </button>
            <button
              onClick={() => handle(r.id, 'reject')}
              disabled={loading === r.id}
              className="bg-white text-gray-600 border border-[#F0F0EF] text-xs px-3 py-1.5 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              거절
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
