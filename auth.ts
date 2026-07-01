import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { createServiceClient } from '@/lib/supabase-server'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    // JWT 콜백은 매 요청마다 호출되어 DB에서 허용 여부를 재확인함 — 권한 삭제 시 즉시 반영됨
    async jwt({ token, account, profile }) {
      if (token.email) {
        const sb = createServiceClient()
        const userId = (profile as { sub?: string } | undefined)?.sub ?? (account?.providerAccountId)

        // 최초 로그인 시 user_id 갱신
        if (userId && token.email) {
          await sb
            .from('allowed_users')
            .update({ user_id: userId })
            .eq('email', token.email)
            .is('user_id', null)
        }

        // user_id 또는 email로 허용 여부 확인
        const query = userId
          ? sb.from('allowed_users').select('email, is_admin').or(`email.eq.${token.email},user_id.eq.${userId}`)
          : sb.from('allowed_users').select('email, is_admin').eq('email', token.email)

        const { data } = await query.limit(1).single()
        token.isAllowed = !!data
        token.isAdmin = !!(data as { is_admin?: boolean } | null)?.is_admin
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.isAllowed = token.isAllowed as boolean
        session.user.isAdmin = token.isAdmin as boolean
      }
      return session
    },
  },
})
