'use server';
import {insertDeal,setDealStatus,dealDates} from '@/lib/deal-write';
import {editDeal,changePayment} from '@/lib/deal-edit';
import { prisma } from '@/lib/db';
import { currentUser,can } from '@/lib/access';
import { calcDeal,inputNumber } from '@/lib/money';
import { DEAL_STATUSES, type Status } from '@/lib/deal-status';
import { dealTransaction,lockDeal,ensureAllocations,reconcileDeal } from '@/lib/deal-ledger';
import {businessToday,parseCalendarDate} from '@/lib/dates';
import {requireWritable} from '@/lib/access';
import { audit } from '@/lib/audit';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
function refresh(id?:string){for(const path of ['/','/analytics', '/deals','/clients','/payouts','/profile',...(id?[`/deals/${id}`]:[])])revalidatePath(path);}
function message(error:unknown){return error instanceof Error?error.message:'Не удалось сохранить изменение';}
type State={error:string};
export async function createDeal(_state:State,fd:FormData):Promise<State>{
 const u=await currentUser();if(!can(u,'deals.create'))return{error:'Нет права создавать сделки'};
 let id:string;
 try {
  id=await dealTransaction(tx=>insertDeal(tx,u,fd));
 }catch(error){return{error:message(error)}}
 refresh();redirect(`/deals/${id}`);
}
export async function changeDealStatus(_state:State,fd:FormData):Promise<State>{
 const u=await currentUser(),id=String(fd.get('dealId')),status=String(fd.get('status')) as Status;
 try {
  if(!(Object.hasOwn(DEAL_STATUSES,status)))throw new Error('Неизвестный статус');
  await dealTransaction(async tx=>{
   await setDealStatus(tx,u,id,status);
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
  if(amount<=0||amount>1e12||Math.abs(amount*100-Math.round(amount*100))>.0001)throw new Error('Введите положительную сумму с точностью до двух знаков после запятой');
  if(!['PARTNER_TO_US','US_TO_CLIENT'].includes(direction))throw new Error('Неизвестный тип платежа');
  if(date)parseCalendarDate(date);
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
export async function addComment(fd:FormData){const u=await currentUser();requireWritable(u);const dealId=String(fd.get('dealId'));const d=await prisma.deal.findUniqueOrThrow({where:{id:dealId}});if(d.deletedAt)throw new Error('Сделка в архиве');await prisma.comment.create({data:{entityType:'DEAL',dealId,authorId:u.id,text:String(fd.get('text'))}});await audit(u.id,'COMMENT','deal',dealId);revalidatePath(`/deals/${dealId}`)}
export async function editComment(fd:FormData){const u=await currentUser();requireWritable(u);const c=await prisma.comment.findUniqueOrThrow({where:{id:String(fd.get('commentId'))}});if(c.authorId!==u.id&&u.role!=='SUPER_ADMIN')throw new Error('Нет прав');await prisma.$transaction([prisma.commentRevision.create({data:{commentId:c.id,text:c.text,editedBy:u.id}}),prisma.comment.update({where:{id:c.id},data:{text:String(fd.get('text'))}})]);await audit(u.id,'EDIT_COMMENT','comment',c.id);if(c.dealId)revalidatePath(`/deals/${c.dealId}`)}
export async function deleteComment(fd:FormData){const u=await currentUser();requireWritable(u);const c=await prisma.comment.findUniqueOrThrow({where:{id:String(fd.get('commentId'))}});if(c.authorId!==u.id&&u.role!=='SUPER_ADMIN')throw new Error('Нет прав');await prisma.$transaction([prisma.commentRevision.create({data:{commentId:c.id,text:c.text,editedBy:u.id}}),prisma.comment.update({where:{id:c.id},data:{deletedAt:new Date()}})]);await audit(u.id,'DELETE_COMMENT','comment',c.id);if(c.dealId)revalidatePath(`/deals/${c.dealId}`)}

export async function updateDealDetails(_:State,fd:FormData):Promise<State>{
 const u=await currentUser(),id=String(fd.get('dealId'));
 try{
  if(String(fd.get('partnerName')??'').trim()&&!fd.get('partnerId'))throw new Error('Выберите партнёра из списка или очистите поле.');
  const input={...dealDates(fd),version:String(fd.get('version')),title:String(fd.get('title')??'').trim(),clientId:String(fd.get('clientId')??''),partnerId:String(fd.get('partnerId')??'')||null,assignedTo:String(fd.get('assignedTo')??''),amount:inputNumber(fd.get('amount')),partnerRate:inputNumber(fd.get('partnerRate')),clientRate:inputNumber(fd.get('clientRate'))};
  for(const field of ['amount','partnerRate','clientRate'])if(!String(fd.get(field)??'').trim())throw new Error('Заполните сумму и оба процента.');
  await dealTransaction(tx=>editDeal(tx,u,id,input));refresh(id);return {error:''};
 }catch(e){return {error:message(e)};}
}
export async function updatePayment(_:State,fd:FormData):Promise<State>{
 const u=await currentUser();
 try{
  const remove=fd.get('remove')==='1',date=String(fd.get('paidAt')??'');
  if(!remove)parseCalendarDate(date);
  const note=String(fd.get('note')??'').trim();if(note.length>1000)throw new Error('Комментарий: до 1000 символов.');
  const id=await dealTransaction(tx=>changePayment(tx,u,String(fd.get('paymentId')),{version:String(fd.get('version')),remove,amount:remove?0:inputNumber(fd.get('amount')),direction:String(fd.get('direction')) as 'PARTNER_TO_US'|'US_TO_CLIENT',paidAt:remove?new Date():new Date(`${date}T12:00:00+05:00`),note:note||null}));
  refresh(id);return {error:''};
 }catch(e){return {error:message(e)};}
}
