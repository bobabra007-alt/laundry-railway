import { prisma } from '@/lib/db';
export default async function AttachmentList({ entityType, entityId }: { entityType: 'CLIENT' | 'DEAL'; entityId: string }) {
  const files = await prisma.attachment.findMany({ where: { entityType, entityId }, select: { id: true, filename: true, size: true }, orderBy: { createdAt: 'desc' } });
  if (!files.length) return <div className="sub">Файлов пока нет.</div>;
  return <div className="stack">{files.map(file => <a className="row" href={`/api/attachments/${file.id}`} key={file.id}><span>{file.filename}</span><span className="sub">{Math.ceil(file.size / 1024)} КБ · Скачать</span></a>)}</div>;
}
