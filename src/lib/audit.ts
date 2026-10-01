import { prisma } from '@/lib/db';
export async function audit(userId:string, action:string, entity:string, entityId:string, payload?:unknown) {
  await prisma.auditLog.create({ data: { userId, action, entity, entityId, payload: payload as any } });
}
