import { auth } from '@/auth';
import { prisma } from '@/lib/db';
export const runtime = 'nodejs';
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return new Response('Войдите в систему', { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true,sessionVersion:true } });
  if (!user?.isActive || ((session?.user as any)?.version??0)!==user.sessionVersion) return new Response('Нет доступа', { status: 403 });
  const { id } = await params;
  const file = await prisma.attachment.findUnique({ where: { id } });
  if (!file?.data) return new Response('Файл не найден', { status: 404 });
  return new Response(new Uint8Array(file.data), { headers: {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(file.filename).replace(/'/g, '%27')}`,
    'Content-Length': String(file.size),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  } });
}
