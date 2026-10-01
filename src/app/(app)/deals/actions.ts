'use server';
import { prisma } from '@/lib/db';
import { currentUser,can } from '@/lib/access';
import { calcDeal,inputNumber } from '@/lib/money';
import { DEAL_STATUSES, type Status } from '@/lib/deal-status';
import { dealTransaction,lockDeal,ensureAllocations,reconcileDeal } from '@/lib/deal-ledger';
import { audit } from '@/lib/audit';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
function refresh(id?:string){for(const path of ['/', '/deals','/clients','/payouts','/profile',...(id?[`/deals/${id}`]:[])])revalidatePath(path);}
function message(error:unknown){return error instanceof Error?error.message:'Не удалось сохранить изменение';}
type State={error:string};
export async function createDeal(_state:State,fd:FormData):Promise<State>{
 const u=await currentUser();if(!can(u,'deals.create'))return{error:'Нет права создавать сделки'};
 let id:string;
 try {
  const title=String(fd.get('title')??'').trim(),amount=inputNumber(fd.get('amount')),partnerRate=inputNumber(fd.get('partnerRate')),clientRate=inputNumber(fd.get('clientRate'));
  if(!title||title.length>200)throw new Error('Название: от 1 до 200 символов');
  if(amount<=0||amount>1e12||partnerRate<0||partnerRate>100||clientRate<0||clientRate>100)throw new Error('Сумма должна быть положительной, проценты — от 0 до 100');
  id=await dealTransaction(async tx=>{
   let clientId=String(fd.get('clientId')??''),partnerId=String(fd.get('partnerId')??'')||null;
   if(!clientId){
    const name=String(fd.get('clientName')??'').trim();if(!name||name.length>200)throw new Error('Выберите клиента или введите его имя');
    if(!can(u,'clients.create'))throw new Error('Для нового клиента требуется право создавать клиентов');
    const existing=await tx.client.findFirst({where:{name:{equals:name,mode:'insensitive'}}});
    if(existing){if(existing.assignedTo!==u.id||existing.status==='ARCHIVED')throw new Error('Этот клиент уже есть у другого ответственного или в архиве. Выберите своего клиента.');clientId=existing.id;}
    else {const c=await tx.client.create({data:{name,assignedTo:u.id,createdBy:u.id}});clientId=c.id;await tx.clientAssignmentHistory.create({data:{clientId,toUserId:u.id,changedBy:u.id}});await tx.auditLog.create({data:{userId:u.id,action:'CREATE','entity':'client',entityId:clientId}});}
   }
   const client=await tx.client.findFirst({where:{id:clientId,assignedTo:u.id,status:{not:'ARCHIVED'}}});
   if(!client)throw new Error('Сделку может создать только ответственный за клиента');
   const partnerName=String(fd.get('partnerName')??'').trim();
   if(!partnerId&&partnerName){
    if(partnerName.length>200)throw new Error('Имя партнёра слишком длинное');
    const existing=await tx.partner.findFirst({where:{name:{equals:partnerName,mode:'insensitive'}}});
    if(existing){if(existing.archived)throw new Error('Партнёр находится в архиве');partnerId=existing.id;}
    else {if(!can(u,'partners.manage'))throw new Error('Для нового партнёра требуется право управления партнёрами');const p=await tx.partner.create({data:{name:partnerName}});partnerId=p.id;await tx.auditLog.create({data:{userId:u.id,action:'CREATE',entity:'partner',entityId:p.id}});}
   }
   if(partnerId&&!(await tx.partner.findFirst({where:{id:partnerId,archived:false}})))throw new Error('Партнёр не найден');
   const d=await tx.deal.create({data:{title,clientId,partnerId,assignedTo:u.id,createdBy:u.id,amount,partnerRate,clientRate,...calcDeal(amount,partnerRate,clientRate),employeeCount:4,allocationVersion:1,status:'NEW'}});
   await tx.userPreference.upsert({where:{userId:u.id},update:{lastPartnerRate:partnerRate,lastClientRate:clientRate},create:{userId:u.id,lastPartnerRate:partnerRate,lastClientRate:clientRate}});
   await tx.auditLog.create({data:{userId:u.id,action:'CREATE',entity:'deal',entityId:d.id,payload:{amount,partnerRate,clientRate}}});return d.id;
  });
 }catch(error){return{error:message(error)}}
 refresh();redirect(`/deals/${id}`);
}
export async function changeDealStatus(_state:State,fd:FormData):Promise<State>{
 const u=await currentUser(),id=String(fd.get('dealId')),status=String(fd.get('status')) as Status;
 try {
  if(!(status in DEAL_STATUSES))throw new Error('Неизвестный статус');
  await dealTransaction(async tx=>{
   const d=await lockDeal(tx,id);
   if(d.deletedAt)throw new Error('Сначала восстановите сделку из архива');
   if(!can(u,'deals.edit_any')&&!(d.assignedTo===u.id&&can(u,'deals.edit_own')))throw new Error('Нет права изменять эту сделку');
   if(status===d.status)return;
   if(status==='COMPLETED'&&!can(u,'deals.complete'))throw new Error('Нет права завершать сделки');
   if(d.status==='COMPLETED'&&u.role!=='SUPER_ADMIN')throw new Error('Повторно открыть завершённую сделку может только администратор');
   if(status==='COMPLETED')await ensureAllocations(tx,id);
   if(status==='COMPLETED'||d.posted)await reconcileDeal(tx,id,status==='COMPLETED',u.id,status==='COMPLETED'?'Начисление после завершения сделки':'Отмена начислений после изменения статуса');
   await tx.deal.update({where:{id},data:{status,closedAt:status==='COMPLETED'?new Date():null}});
   await tx.auditLog.create({data:{userId:u.id,action:'CHANGE_STATUS',entity:'deal',entityId:id,payload:{from:d.status,to:status}}});
  });refresh(id);return{error:''};
 }catch(error){return{error:message(error)}}
}
export async function deleteDeal(_state:State,fd:FormData):Promise<State>{
 const u=await currentUser(),id=String(fd.get('dealId'));
 try {
  await dealTransaction(async tx=>{
   const d=await lockDeal(tx,id);if(d.deletedAt)return;
   if(!can(u,'deals.edit_any')&&!(d.assignedTo===u.id&&can(u,'deals.edit_own')))throw new Error('Нет права удалить сделку');
   if(d.status==='COMPLETED'&&u.role!=='SUPER_ADMIN')throw new Error('Завершённую сделку удаляет только администратор');
   if(d.posted)await reconcileDeal(tx,id,false,u.id,'Отмена начислений при удалении сделки');
   await tx.deal.update({where:{id},data:{deletedAt:new Date(),deletedBy:u.id}});
   await tx.auditLog.create({data:{userId:u.id,action:'DELETE',entity:'deal',entityId:id,payload:{title:d.title}}});
  });refresh(id);return{error:''};
 }catch(error){return{error:message(error)}}
}
export async function restoreDeal(_state:State,fd:FormData):Promise<State>{
 const u=await currentUser(),id=String(fd.get('dealId'));
 try {
  if(u.role!=='SUPER_ADMIN')throw new Error('Восстановление доступно администратору');
  await dealTransaction(async tx=>{
   const d=await lockDeal(tx,id);if(!d.deletedAt)return;
   if(d.status==='COMPLETED'){await ensureAllocations(tx,id);await reconcileDeal(tx,id,true,u.id,'Восстановление начислений из архива');}
   await tx.deal.update({where:{id},data:{deletedAt:null,deletedBy:null}});
   await tx.auditLog.create({data:{userId:u.id,action:'RESTORE',entity:'deal',entityId:id}});
  });refresh(id);return{error:''};
 }catch(error){return{error:message(error)}}
}
export async function addPayment(_state:State,fd:FormData):Promise<State>{
 const u=await currentUser(),id=String(fd.get('dealId'));
 try {
  const amount=inputNumber(fd.get('amount')),direction=String(fd.get('direction')),date=String(fd.get('paidAt')??'');
  if(amount<=0||amount>1e12)throw new Error('Введите положительную сумму');
  if(!['PARTNER_TO_US','US_TO_CLIENT'].includes(direction))throw new Error('Неизвестный тип платежа');
  const paidAt=date?new Date(`${date}T12:00:00+05:00`):new Date();if(!Number.isFinite(paidAt.getTime()))throw new Error('Некорректная дата');
  await dealTransaction(async tx=>{
   const d=await lockDeal(tx,id);
   if(d.deletedAt)throw new Error('Сделка в архиве');
   if(!can(u,'deals.edit_any')&&!(d.assignedTo===u.id&&can(u,'deals.edit_own')))throw new Error('Нет права добавлять платежи');
   await tx.dealPayment.create({data:{dealId:id,direction:direction as 'PARTNER_TO_US'|'US_TO_CLIENT',amount,paidAt,note:String(fd.get('note')||'')||null,createdBy:u.id}});
   await tx.auditLog.create({data:{userId:u.id,action:'ADD_PAYMENT',entity:'deal',entityId:id,payload:{direction,amount}}});
  });refresh(id);return{error:''};
 }catch(error){return{error:message(error)}}
}
export async function addComment(fd:FormData){const u=await currentUser();const dealId=String(fd.get('dealId'));const d=await prisma.deal.findUniqueOrThrow({where:{id:dealId}});if(d.deletedAt)throw new Error('Сделка в архиве');await prisma.comment.create({data:{entityType:'DEAL',dealId,authorId:u.id,text:String(fd.get('text'))}});await audit(u.id,'COMMENT','deal',dealId);revalidatePath(`/deals/${dealId}`)}
export async function editComment(fd:FormData){const u=await currentUser();const c=await prisma.comment.findUniqueOrThrow({where:{id:String(fd.get('commentId'))}});if(c.authorId!==u.id&&u.role!=='SUPER_ADMIN')throw new Error('Нет прав');await prisma.$transaction([prisma.commentRevision.create({data:{commentId:c.id,text:c.text,editedBy:u.id}}),prisma.comment.update({where:{id:c.id},data:{text:String(fd.get('text'))}})]);await audit(u.id,'EDIT_COMMENT','comment',c.id);if(c.dealId)revalidatePath(`/deals/${c.dealId}`)}
export async function deleteComment(fd:FormData){const u=await currentUser();const c=await prisma.comment.findUniqueOrThrow({where:{id:String(fd.get('commentId'))}});if(c.authorId!==u.id&&u.role!=='SUPER_ADMIN')throw new Error('Нет прав');await prisma.$transaction([prisma.commentRevision.create({data:{commentId:c.id,text:c.text,editedBy:u.id}}),prisma.comment.update({where:{id:c.id},data:{deletedAt:new Date()}})]);await audit(u.id,'DELETE_COMMENT','comment',c.id);if(c.dealId)revalidatePath(`/deals/${c.dealId}`)}
