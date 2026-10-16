import {Prisma} from '../../generated/prisma/client';
export async function archiveUser(tx:Prisma.TransactionClient,actorId:string,userId:string){
 await tx.$queryRaw`SELECT pg_advisory_xact_lock(471910)::text`;
 const actor=await tx.user.findUniqueOrThrow({where:{id:actorId}});
 if(actor.role!=='SUPER_ADMIN'||!actor.isActive||actor.deletedAt)throw new Error('Удаление доступно только администратору.');
 const target=await tx.user.findUniqueOrThrow({where:{id:userId}});
 if(target.id===actorId||target.role==='SUPER_ADMIN')throw new Error('Нельзя удалить главного администратора или собственный аккаунт.');
 if(target.deletedAt)return;
 await tx.user.update({where:{id:userId},data:{deletedAt:new Date(),isActive:false,participatesInEmployeeBank:false,sessionVersion:{increment:1}}});
 await tx.auditLog.create({data:{userId:actorId,action:'DELETE_USER',entity:'user',entityId:userId,payload:{displayName:target.displayName,username:target.username,wasParticipant:target.participatesInEmployeeBank,historyPreserved:true}}});
}
