'use server';
import {currentUser,requireWritable} from '@/lib/access';
import {inputNumber} from '@/lib/money';
import {dealTransaction} from '@/lib/deal-ledger';
import {recordPayout} from '@/lib/payout-ledger';
import {revalidatePath} from 'next/cache';
export type PayoutState={error?:string;success?:string;receiptId?:string};
export async function confirmPayout(_:PayoutState,fd:FormData):Promise<PayoutState>{
 const u=await currentUser();
 try{
  requireWritable(u);
  if(!String(fd.get('received')??'').trim())throw new Error('Укажите фактически полученную сумму.');
  const input={requestId:String(fd.get('requestId')??''),amount:inputNumber(fd.get('received')),receivedOn:String(fd.get('receivedOn')??''),note:String(fd.get('note')??'').trim()};
  const receipt=await dealTransaction(tx=>recordPayout(tx,u.id,input));
  for(const path of ['/payouts','/','/analytics','/profile'])revalidatePath(path);
  return {success:input.amount===0?'Отмечено, что выплата пока не получена. Баланс сохранён.':'Получение записано. Оставшийся баланс доступен для следующих выплат.',receiptId:receipt.id};
 }catch(e){return {error:e instanceof Error?e.message:'Не удалось записать выплату'};}
}
