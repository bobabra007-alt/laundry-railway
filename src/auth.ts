import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import {allowLogin,clearLogin} from '@/lib/login-throttle';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt', maxAge: 8*60*60 },
  pages: { signIn: '/login' },
  providers: [Credentials({
    credentials: { username: {}, password: {} },
    authorize: async (credentials) => {
      const username = String(credentials?.username ?? '').trim();
      const password = String(credentials?.password ?? '');
      if(!username||username.length>100||!password||new TextEncoder().encode(password).length>72)return null;
      const user = await prisma.user.findUnique({ where: { username } });
      if (!user?.isActive) return null;
      const throttle=await allowLogin(username);if(!throttle.allowed)return null;
      if (!(await bcrypt.compare(password, user.passwordHash))) return null;
      await clearLogin(throttle.key);
      return { version:user.sessionVersion,id: user.id, name: user.displayName, email: `${user.username}@laundra.local`, role: user.role } as any;
    }
  })],
  callbacks: {
    authorized({auth,request}) {return request.nextUrl.pathname==='/login'||!!auth?.user;},
    jwt({ token, user }) { if (user) { token.uid = user.id; token.version=(user as any).version; token.role = (user as any).role; } return token; },
    session({ session, token }) { (session.user as any).id = token.uid;(session.user as any).version=token.version??0; (session.user as any).role = token.role; return session; }
  }
});
