'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'

export default function UnauthorizedPage() {
  const { data: session } = useSession()
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const name = session?.user?.name ?? ''
  const email = session?.user?.email ?? ''

  async function handleRequest() {
    setLoading(true)
    setError('')
    const res = await fetch('/api/access-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const data = await res.json()
    if (!res.ok) setError(data.error ?? '오류가 발생했습니다.')
    else setSubmitted(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 w-full max-w-sm text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-2">접근 권한이 없습니다</h1>
        <p className="text-sm text-gray-500 mb-6">
          이 서비스는 승인된 계정만 이용할 수 있습니다.
          <br />관리자에게 접근 요청을 보낼 수 있습니다.
        </p>
        {submitted ? (
          <div className="bg-green-50 text-green-700 rounded-lg px-4 py-3 text-sm">
            요청이 접수되었습니다. 관리자 승인 후 이용 가능합니다.
          </div>
        ) : (
          <>
            <div className="text-left mb-4 space-y-2">
              <div className="text-sm text-gray-500">이름: <span className="text-gray-800 font-medium">{name}</span></div>
              <div className="text-sm text-gray-500">이메일: <span className="text-gray-800 font-medium">{email}</span></div>
            </div>
            {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
            <button
              onClick={handleRequest}
              disabled={loading}
              className="w-full bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? '요청 중...' : '접근 요청 보내기'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
