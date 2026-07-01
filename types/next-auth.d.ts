import 'next-auth'
import { JWT as DefaultJWT } from 'next-auth/jwt'

declare module 'next-auth' {
  interface User {
    isAllowed?: boolean
    isAdmin?: boolean
  }
  interface Session {
    user: User & {
      isAllowed?: boolean
      isAdmin?: boolean
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    isAllowed?: boolean
    isAdmin?: boolean
  }
}
