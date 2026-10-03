import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { hasPermission } from './permissions';
import { redirect } from 'next/navigation';

export async function currentUser() {
  const session = await auth();
  const id = (session?.user as any)?.id as string | undefined;
  if (!id) redirect('/login');
  const user = await prisma.user.findUnique({ where: { id }, include: { permissions: true } });
  if (!user?.isActive || ((session?.user as any)?.version ?? 0) !== user.sessionVersion) redirect('/login');
  return user;
}
export function can(user: Awaited<ReturnType<typeof currentUser>>, key: string) {
  return hasPermission(user,key);
}

export function requireWritable(user:Awaited<ReturnType<typeof currentUser>>) {if(user.isReadOnly&&user.role!=='SUPER_ADMIN')throw new Error('У аккаунта режим «Только просмотр»');}
