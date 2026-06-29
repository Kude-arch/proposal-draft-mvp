export default function ProposalsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <a href="/" className="text-blue-600 font-bold text-lg">제안서 자동생성</a>
        <span className="text-gray-300">|</span>
        <span className="text-gray-500 text-sm">미래사업팀</span>
      </header>
      {children}
    </div>
  )
}
