import {Prisma} from '../../generated/prisma/client';
import {businessToday,parseCalendarDate} from './dates';
import {round2} from './money';
export type ReceiptInput={requestId:string;amount:number;receivedOn:string;note:string};
export function validateReceipt(input:ReceiptInput,now=new Date()) {
 if(!/^[a-zA-Z0-9-]{16,80}$/.test(input.requestId))throw new Error('Обновите форму выплаты.');
 if(!Number.isFinite(input.amount)||input.amount<0||input.amount>1e12||Math.abs(input.amount*100-Math.round(input.amount*100))>.0001)throw new Error('Укажите сумму от 0 с точностью до двух знаков.');
 const receivedOn=parseCalendarDate(input.receivedOn);
 if(input.receivedOn>businessToday(now))throw new Error('Дата получения не может быть в будущем.');
 if(input.note.length>1000)throw new Error('Комментарий: до 1000 символов.');
 return receivedOn;
}
// Caller runs this inside dealTransaction (Serializable, retry on conflict).
export async function recordPayout(tx:Prisma.TransactionClient,userId:string,input:ReceiptInput,now=new Date()) {
 const receivedOn=validateReceipt(input,now);
 await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR UPDATE`;
 const user=await tx.user.findUniqueOrThrow({where:{id:userId}});
 if(!user.isActive||user.deletedAt||user.isReadOnly)throw new Error('Нет права подтверждать выплаты.');
 const existing=await tx.employeePayoutReceipt.findUnique({where:{requestId:input.requestId}});
 if(existing){if(existing.userId!==userId)throw new Error('Неверный идентификатор операции.');return existing;}
 // Always subtract ALL payouts, including those recorded after an older period ended.
 const sum=await tx.employeeLedgerEntry.aggregate({where:{userId},_sum:{amount:true}});
 const balance=round2(Number(sum._sum.amount??0));
 if(input.amount>Math.max(0,balance))throw new Error(`Сумма превышает доступный остаток ${Math.max(0,balance).toFixed(2)} USDT. Обновите страницу.`);
 const balanceAfter=round2(balance-input.amount);
 const receipt=await tx.employeePayoutReceipt.create({data:{requestId:input.requestId,userId,amount:input.amount,receivedOn,note:input.note||null,balanceAfter}});
 const note=`Выплата ${user.displayName} · ${input.receivedOn} · ${receipt.id}`;
 if(input.amount>0){
  await tx.employeeLedgerEntry.create({data:{userId,kind:'PAYOUT',amount:-input.amount,note}});
  await tx.bankLedgerEntry.create({data:{bank:'EMPLOYEES',kind:'PAYOUT',amount:-input.amount,note}});
 }
 await tx.auditLog.create({data:{userId,action:'RECORD_PAYOUT',entity:'payout_receipt',entityId:receipt.id,payload:{amount:input.amount,receivedOn:input.receivedOn,balanceBefore:balance,balanceAfter}}});
 return receipt;
}
