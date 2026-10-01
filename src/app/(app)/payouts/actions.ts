'use server';
import { currentUser } from '@/lib/access';import { inputNumber,round2 } from '@/lib/money';import { dealTransaction } from '@/lib/deal-ledger';import { revalidatePath } from 'next/cache';
export async function confirmPayout(fd:FormData){
 const u=await currentUser(),id=String(fd.get('periodId')),received=inputNumber(fd.get('received'));
 if(received<0)throw new Error('Полученная сумма не может быть отрицательной');
 await dealTransaction(async tx=>{
  await tx.$queryRaw`SELECT "id" FROM "EmployeePayoutPeriod" WHERE "id"=${id} FOR UPDATE`;
  const p=await tx.employeePayoutPeriod.findUniqueOrThrow({where:{id}});
  if(p.userId!==u.id)throw new Error('Можно подтвердить только свою выплату');
  if(p.status!=='OPEN')return;
  if(new Date()<p.dueDate)throw new Error('Подтверждение доступно в дату выплаты');
  const balance=await tx.employeeLedgerEntry.aggregate({where:{userId:u.id,createdAt:{lte:p.periodEnd}},_sum:{amount:true}});
  const due=Math.max(0,round2(Number(balance._sum.amount||0)));
  if(received>due)throw new Error('Сумма больше текущего остатка. Обновите страницу выплат.');
  const carry=round2(due-received),status=received===due?'CONFIRMED':received===0?'UNPAID':'PARTIAL';
  await tx.employeePayoutPeriod.update({where:{id},data:{amountDue:due,amountConfirmed:received,carriedForward:carry,status,confirmedAt:new Date()}});
  if(received>0){await tx.employeeLedgerEntry.create({data:{userId:u.id,kind:'PAYOUT',amount:-received,payoutPeriodId:id,note:'Подтверждённая выплата сотруднику'}});await tx.bankLedgerEntry.create({data:{bank:'EMPLOYEES',kind:'PAYOUT',amount:-received,note:`Выплата ${u.displayName}`}});}
  await tx.auditLog.create({data:{userId:u.id,action:'CONFIRM_PAYOUT',entity:'payout_period',entityId:id,payload:{due,received,carry,status}}});
 });revalidatePath('/payouts');revalidatePath('/');
}
