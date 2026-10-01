import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';

export async function currentUser() {
  const session = await auth();
  const id = (session?.user as any)?.id as string | undefined;
  if (!id) redirect('/login');
  const user = await prisma.user.findUnique({ where: { id }, include: { permissions: true } });
  if (!user?.isActive) redirect('/login');
  return user;
}
export function can(user: Awaited<ReturnType<typeof currentUser>>, key: string) {
  return user.role === 'SUPER_ADMIN' || user.permissions.some(p => p.key === key && p.enabled);
}
