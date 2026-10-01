import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [Credentials({
    credentials: { username: {}, password: {} },
    authorize: async (credentials) => {
      const username = String(credentials?.username ?? '').trim();
      const password = String(credentials?.password ?? '');
      const user = await prisma.user.findUnique({ where: { username } });
      if (!user?.isActive) return null;
      if (!(await bcrypt.compare(password, user.passwordHash))) return null;
      return { id: user.id, name: user.displayName, email: `${user.username}@laundra.local`, role: user.role } as any;
    }
  })],
  callbacks: {
    jwt({ token, user }) { if (user) { token.uid = user.id; token.role = (user as any).role; } return token; },
    session({ session, token }) { (session.user as any).id = token.uid; (session.user as any).role = token.role; return session; }
  }
});
