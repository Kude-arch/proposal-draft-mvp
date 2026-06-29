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

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="text-xl font-bold text-gray-900 mb-6">접근 요청 관리</h1>
      {requests.length === 0 ? (
        <p className="text-gray-500 text-sm">대기 중인 요청이 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="bg-white border border-gray-200 rounded-lg px-5 py-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-gray-900 text-sm">{r.name}</p>
                <p className="text-gray-500 text-xs">{r.email}</p>
                <p className="text-gray-400 text-xs mt-0.5">{new Date(r.created_at).toLocaleString('ko-KR')}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handle(r.id, 'approve')}
                  disabled={loading === r.id}
                  className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  승인
                </button>
                <button
                  onClick={() => handle(r.id, 'reject')}
                  disabled={loading === r.id}
                  className="bg-white text-gray-600 border border-gray-300 text-xs px-3 py-1.5 rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  거절
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
