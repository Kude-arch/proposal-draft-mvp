import { auth } from '@/auth'
import { NextResponse } from 'next/server'

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  const publicPaths = ['/login', '/api/auth']
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  if (!session) {
    const loginUrl = new URL('/login', req.url)
    return NextResponse.redirect(loginUrl)
  }

  const isAllowed = (session.user as any)?.isAllowed
  const unauthorizedPaths = ['/unauthorized', '/api/access-request']
  if (!isAllowed && !unauthorizedPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/unauthorized', req.url))
  }

  if (pathname.startsWith('/admin') && session.user?.email !== 'hoo000kr789@gmail.com') {
    return NextResponse.redirect(new URL('/', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
