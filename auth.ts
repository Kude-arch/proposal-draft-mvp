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
    async jwt({ token }) {
      if (token.email) {
        const sb = createServiceClient()
        const { data } = await sb
          .from('allowed_users')
          .select('email')
          .eq('email', token.email)
          .single()
        token.isAllowed = !!data
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).isAllowed = token.isAllowed as boolean
      }
      return session
    },
  },
})
