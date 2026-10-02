 'use server';
import { currentUser } from '@/lib/access';
import { dealTransaction } from '@/lib/deal-ledger';
import { lockExpense, reconcileExpense } from '@/lib/expense-ledger';
import { inputNumber, calcExpense } from '@/lib/money';
import { parseCalendarDate } from '@/lib/dates';
import { revalidatePath } from 'next/cache';
export type ExpenseState={error?:string;success?:string};
function refresh(){for(const path of ['/expenses','/','/payouts','/profile'])revalidatePath(path);}
function data(fd:FormData){
 const description=String(fd.get('description')??'').trim();
 const raw=inputNumber(fd.get('amount'));
 if(!description||description.length>1000)throw new Error('Описание: от 1 до 1000 символов');
 if(raw<=0||raw>999999999999||Math.abs(raw*100-Math.round(raw*100))>0.0001)throw new Error('Введите положительную сумму, не более двух знаков после запятой');
 return {description,amount:raw,spentOn:parseCalendarDate(String(fd.get('spentOn')??''))};
}
function error(e:unknown):ExpenseState{return {error:e instanceof Error?e.message:'Не удалось сохранить расход'};}
export async function createExpense(_:ExpenseState,fd:FormData):Promise<ExpenseState>{
 const u=await currentUser();
 try{
  const values=data(fd),requestId=String(fd.get('requestId')??'');
  if(!/^[a-zA-Z0-9-]{10,80}$/.test(requestId))throw new Error('Обновите страницу и повторите');
  await dealTransaction(async tx=>{
   const existing=await tx.expense.findUnique({where:{requestId}});
   if(existing){if(existing.authorId!==u.id)throw new Error('Недопустимый запрос');return;}
   const expense=await tx.expense.create({data:{...values,requestId,authorId:u.id}});
   const users=await tx.user.findMany({where:{isActive:true,participatesInEmployeeBank:true},orderBy:[{createdAt:'asc'},{id:'asc'}],take:4,select:{id:true}});
   await tx.expenseAllocation.createMany({data:calcExpense(values.amount).allocations.map((amount,slot)=>({expenseId:expense.id,slot,amount,userId:users[slot]?.id??null}))});
   await reconcileExpense(tx,expense.id,u.id,'Добавление расхода: '+values.description);
  });refresh();return {success:'Расход добавлен. Балансы обновлены.'};
 }catch(e){return error(e);}
}
export async function updateExpense(_:ExpenseState,fd:FormData):Promise<ExpenseState>{
 const u=await currentUser();
 try{const values=data(fd),id=String(fd.get('id'));
  await dealTransaction(async tx=>{
   const old=await lockExpense(tx,id);
   if(old.authorId!==u.id&&u.role!=='SUPER_ADMIN')throw new Error('Можно изменять только свои траты');
   if(old.deletedAt)throw new Error('Расход уже удалён');
   if(old.updatedAt.toISOString()!==String(fd.get('version')))throw new Error('Расход уже изменился. Обновите страницу.');
   await tx.expense.update({where:{id},data:values});
   const split=calcExpense(values.amount);
   for(const a of old.allocations)await tx.expenseAllocation.update({where:{id:a.id},data:{amount:split.allocations[a.slot]}});
   await tx.auditLog.create({data:{userId:u.id,action:'EDIT_EXPENSE',entity:'expense',entityId:id,payload:{before:{description:old.description,amount:String(old.amount),spentOn:old.spentOn.toISOString()},after:{...values,spentOn:values.spentOn.toISOString()}}}});
   await reconcileExpense(tx,id,u.id,'Изменение расхода: '+values.description);
  });refresh();return {success:'Расход изменён. Балансы пересчитаны.'};
 }catch(e){return error(e);}
}
export async function deleteExpense(_:ExpenseState,fd:FormData):Promise<ExpenseState>{
 const u=await currentUser();
 try{const id=String(fd.get('id'));await dealTransaction(async tx=>{
  const old=await lockExpense(tx,id);
  if(old.authorId!==u.id&&u.role!=='SUPER_ADMIN')throw new Error('Можно удалять только свои траты');
  if(old.deletedAt)return;
  if(old.updatedAt.toISOString()!==String(fd.get('version')))throw new Error('Расход уже изменился. Обновите страницу.');
  await tx.expense.update({where:{id},data:{deletedAt:new Date()}});
  await reconcileExpense(tx,id,u.id,'Удаление расхода: '+old.description);
 });refresh();return {success:'Расход удалён. Списанные суммы возвращены.'};}catch(e){return error(e);}
}
