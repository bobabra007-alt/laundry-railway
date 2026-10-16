import {Prisma} from '../../generated/prisma/client';
import {calcDeal,splitEmployeeShare} from './money';
import {lockDeal,ensureAllocations,reconcileDeal} from './deal-ledger';
import {hasPermission} from './permissions';
export type DealEditor={id:string;role:string;isReadOnly:boolean;permissions:{key:string;enabled:boolean}[]};
export type DealEdit={version:string;title:string;clientId:string;partnerId:string|null;assignedTo:string;amount:number;partnerRate:number;clientRate:number;dealDate:Date;dueOn:Date|null;expectedPaymentOn:Date|null;waitingReason:string|null};
export function requireDealEditor(actor:DealEditor,deal:{assignedTo:string;deletedAt:Date|null}){
 if(deal.deletedAt)throw new Error('Сделка находится в архиве. Сначала восстановите её.');
 if(!hasPermission(actor,'deals.edit_any')&&!(deal.assignedTo===actor.id&&hasPermission(actor,'deals.edit_own')))throw new Error('Нет права изменять эту сделку.');
}
export function validateDealMoney(amount:number,partnerRate:number,clientRate:number){
 if([amount,partnerRate,clientRate].some(n=>!Number.isFinite(n)||Math.abs(n*100-Math.round(n*100))>.0001))throw new Error('Используйте числа с точностью до двух знаков.');
 if(amount<=0||amount>1e12||partnerRate<0||partnerRate>100||clientRate<0||clientRate>100)throw new Error('Сумма должна быть положительной, проценты — от 0 до 100.');
}
export async function editDeal(tx:Prisma.TransactionClient,actor:DealEditor,id:string,input:DealEdit){
 const d=await lockDeal(tx,id);requireDealEditor(actor,d);
 if(input.version!==d.updatedAt.toISOString())throw new Error('Сделка уже изменена другим пользователем. Обновите страницу перед сохранением.');
 validateDealMoney(input.amount,input.partnerRate,input.clientRate);
 if(!input.title.trim()||input.title.length>200)throw new Error('Название: от 1 до 200 символов.');
 const client=await tx.client.findUnique({where:{id:input.clientId}});
 if(!client||(client.status==='ARCHIVED'&&input.clientId!==d.clientId))throw new Error('Выберите действующего клиента.');
 if(input.clientId!==d.clientId&&!hasPermission(actor,'deals.edit_any')&&client.assignedTo!==actor.id)throw new Error('Можно выбрать только своего клиента.');
 if(input.assignedTo!==d.assignedTo){
  if(!hasPermission(actor,'deals.edit_any'))throw new Error('Изменять ответственного может администратор или сотрудник с правом изменения любых сделок.');
  const owner=await tx.user.findUnique({where:{id:input.assignedTo}});
  if(!owner?.isActive||owner.deletedAt||owner.isReadOnly)throw new Error('Выберите активного ответственного с правом работы.');
 }
 if(input.partnerId){const partner=await tx.partner.findUnique({where:{id:input.partnerId}});if(!partner||(partner.archived&&partner.id!==d.partnerId))throw new Error('Выберите действующего партнёра.');}
 const {version,...values}=input;
 const moneyChanged=Number(d.amount)!==input.amount||Number(d.partnerRate)!==input.partnerRate||Number(d.clientRate)!==input.clientRate;
 // First freeze the recipients, then recalculate the same four slots, even if a member has left.
 if(moneyChanged&&(d.status==='COMPLETED'||d.allocations.length))await ensureAllocations(tx,id);
 await tx.deal.update({where:{id},data:{...values,...(moneyChanged?{...calcDeal(input.amount,input.partnerRate,input.clientRate),employeeCount:4}:{} )}});
 if(moneyChanged){
  const shares=splitEmployeeShare(calcDeal(input.amount,input.partnerRate,input.clientRate).employeesShare);
  const slots=await tx.dealAllocation.findMany({where:{dealId:id}});
  for(const slot of slots)await tx.dealAllocation.update({where:{id:slot.id},data:{amount:shares[slot.slot]}});
  if(d.status==='COMPLETED'||d.posted)await reconcileDeal(tx,id,d.status==='COMPLETED',actor.id,'Корректировка суммы или процентов завершённой сделки');
 }
 const snapshot=(x:typeof d|typeof values)=>({title:x.title,clientId:x.clientId,partnerId:x.partnerId,assignedTo:x.assignedTo,amount:Number(x.amount),partnerRate:Number(x.partnerRate),clientRate:Number(x.clientRate),dealDate:x.dealDate.toISOString(),dueOn:x.dueOn?.toISOString()??null,expectedPaymentOn:x.expectedPaymentOn?.toISOString()??null,waitingReason:x.waitingReason});
 await tx.auditLog.create({data:{userId:actor.id,action:'EDIT_DEAL',entity:'deal',entityId:id,payload:{before:snapshot(d),after:snapshot(values),moneyChanged}}});
 return tx.deal.findUniqueOrThrow({where:{id}});
}
export async function changePayment(tx:Prisma.TransactionClient,actor:DealEditor,id:string,input:{version:string;remove:boolean;amount:number;direction:'PARTNER_TO_US'|'US_TO_CLIENT';paidAt:Date;note:string|null}){
 const old=await tx.dealPayment.findUniqueOrThrow({where:{id}}),deal=await lockDeal(tx,old.dealId);requireDealEditor(actor,deal);
 if(old.deletedAt)throw new Error('Платёж уже удалён. Обновите страницу.');
 if(old.updatedAt.toISOString()!==input.version)throw new Error('Платёж уже изменён. Обновите страницу.');
 if(!input.remove){validateDealMoney(input.amount,0,0);if(!['PARTNER_TO_US','US_TO_CLIENT'].includes(input.direction))throw new Error('Неизвестный тип платежа.');}
 const {version,remove,...values}=input;
 await tx.dealPayment.update({where:{id},data:remove?{deletedAt:new Date()}:values});
 // Also invalidate open deal editors so a stale form cannot silently overwrite new information.
 await tx.deal.update({where:{id:deal.id},data:{updatedAt:new Date()}});
 await tx.auditLog.create({data:{userId:actor.id,action:remove?'DELETE_PAYMENT':'EDIT_PAYMENT',entity:'deal',entityId:deal.id,payload:{paymentId:id,before:{amount:Number(old.amount),direction:old.direction,paidAt:old.paidAt.toISOString(),note:old.note},after:remove?null:{...values,paidAt:values.paidAt.toISOString()}}}});
 return deal.id;
}
