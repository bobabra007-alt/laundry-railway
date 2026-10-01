import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { can } from '@/lib/access';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  const expectedHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
  try { if (!origin || new URL(origin).host !== expectedHost) return NextResponse.json({ error: 'Запрос отклонён' }, { status: 403 }); }
  catch { return NextResponse.json({ error: 'Запрос отклонён' }, { status: 403 }); }
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Войдите в систему' }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { permissions: true } });
  if (!user?.isActive) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  const contentLength = Number(req.headers.get('content-length') || '0');
  if (contentLength > 2 * 1024 * 1024 + 65536) return NextResponse.json({ error: 'Максимум 2 МБ' }, { status: 413 });
  try {
    const fd = await req.formData();
    const file = fd.get('file');
    const entityId = String(fd.get('entityId') || '');
    const entityType = String(fd.get('entityType') || '');
    if (!(file instanceof File) || !file.size || !entityId || !['CLIENT', 'DEAL'].includes(entityType)) return NextResponse.json({ error: 'Выберите файл и карточку' }, { status: 400 });
    if (file.size > 2 * 1024 * 1024) return NextResponse.json({ error: 'Максимум 2 МБ' }, { status: 413 });
    const entity = entityType === 'CLIENT'
      ? await prisma.client.findUnique({ where: { id: entityId }, select: { assignedTo: true } })
      : await prisma.deal.findFirst({ where: { id: entityId, deletedAt: null }, select: { assignedTo: true } });
    if (!entity) return NextResponse.json({ error: 'Карточка не найдена' }, { status: 404 });
    const prefix = entityType === 'CLIENT' ? 'clients' : 'deals';
    if (!can(user, `${prefix}.edit_any`) && !(entity.assignedTo === userId && can(user, `${prefix}.edit_own`))) return NextResponse.json({ error: 'Нет права редактирования карточки' }, { status: 403 });
    const id = crypto.randomUUID();
    const filename = file.name.replace(/[\u0000-\u001f\u007f/\\]/g, '_').slice(0, 200) || 'attachment';
    const data = new Uint8Array(await file.arrayBuffer());
    await prisma.$transaction(async tx => {
      await tx.attachment.create({ data: { id, entityType: entityType as 'CLIENT' | 'DEAL', entityId, filename, mime: file.type || 'application/octet-stream', size: file.size, data, url: `/api/attachments/${id}`, uploadedBy: userId } });
      await tx.auditLog.create({ data: { userId, action: 'UPLOAD_ATTACHMENT', entity: entityType.toLowerCase(), entityId, payload: { attachmentId: id, filename, size: file.size } } });
    });
    return NextResponse.json({ id, filename, url: `/api/attachments/${id}` });
  } catch (error) {
    console.error('Attachment upload failed', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json({ error: 'Не удалось сохранить файл. Попробуйте ещё раз.' }, { status: 500 });
  }
}
