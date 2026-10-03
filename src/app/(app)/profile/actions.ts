'use server';
import bcrypt from 'bcryptjs';
import { currentUser } from '@/lib/access';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';

export async function changePassword(_state: { error: string; success: string }, fd: FormData) {
  const user = await currentUser();
  const current = String(fd.get('currentPassword') ?? '');
  const password = String(fd.get('newPassword') ?? '');
  const repeat = String(fd.get('repeatPassword') ?? '');
  if (password.length < 16 || new TextEncoder().encode(password).length > 72) return { error: 'Новый пароль: от 16 символов, максимум 72 байта UTF-8.', success: '' };
  if (password !== repeat) return { error: 'Новые пароли не совпадают.', success: '' };
  if (!(await bcrypt.compare(current, user.passwordHash))) return { error: 'Текущий пароль неверный.', success: '' };
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash,sessionVersion:{increment:1} } });
    await audit(user.id, 'CHANGE_PASSWORD', 'user', user.id, {});
    return { error: '', success: 'Пароль изменён. Все прежние сеансы завершены; войдите заново.' };
  } catch {
    return { error: 'Не удалось сохранить пароль. Попробуйте ещё раз.', success: '' };
  }
}
