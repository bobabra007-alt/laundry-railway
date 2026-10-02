import { Prisma } from '../../generated/prisma/client';
import { prisma } from './db';
import { dealTransaction } from './deal-ledger';
import { calcExpense, round2 } from './money';
type Tx=Prisma.TransactionClient;
export async function lockExpense(tx:Tx,id:string) {
  await tx.$queryRaw`SELECT "id" FROM "Expense" WHERE "id" = ${id} FOR UPDATE`;
  return tx.expense.findUniqueOrThrow({where:{id},include:{allocations:{orderBy:{slot:'asc'}}}});
}
export async function reconcileExpense(tx:Tx,id:string,actorId:string,reason:string) {
  const expense=await tx.expense.findUniqueOrThrow({where:{id},include:{allocations:true}});
  const split=calcExpense(Number(expense.amount)), active=!expense.deletedAt;
  for(const [bank,share] of [['COMPANY',split.companyShare],['EMPLOYEES',split.employeesShare]] as const) {
    const net=await tx.bankLedgerEntry.aggregate({where:{expenseId:id,bank},_sum:{amount:true}});
    const delta=round2((active?-share:0)-Number(net._sum.amount??0));
    if(delta)await tx.bankLedgerEntry.create({data:{expenseId:id,bank,kind:'EXPENSE',amount:delta,note:reason}});
  }
  const groups=await tx.employeeLedgerEntry.groupBy({by:['userId'],where:{expenseId:id},_sum:{amount:true}});
  const target=new Map(expense.allocations.filter(a=>a.userId).map(a=>[a.userId!,active?-Number(a.amount):0]));
  for(const userId of new Set([...groups.map(g=>g.userId),...target.keys()])) {
    const delta=round2((target.get(userId)??0)-Number(groups.find(g=>g.userId===userId)?._sum.amount??0));
    if(delta)await tx.employeeLedgerEntry.create({data:{userId,expenseId:id,kind:'EXPENSE',amount:delta,note:reason}});
  }
  await tx.auditLog.create({data:{userId:actorId,action:'RECONCILE_EXPENSE',entity:'expense',entityId:id,payload:{reason,active}}});
}
export async function assignReservedExpenseShares(actorId:string) {
  const rows=await prisma.expense.findMany({where:{deletedAt:null,allocations:{some:{userId:null}}},select:{id:true}});
  for(const row of rows)await dealTransaction(async tx=>{
    const expense=await lockExpense(tx,row.id);
    if(expense.deletedAt)return;
    const occupied=expense.allocations.map(a=>a.userId).filter((id):id is string=>!!id);
    const candidates=await tx.user.findMany({where:{isActive:true,participatesInEmployeeBank:true,id:{notIn:occupied}},orderBy:[{createdAt:'asc'},{id:'asc'}],select:{id:true}});
    const free=expense.allocations.filter(a=>!a.userId);
    for(let i=0;i<Math.min(free.length,candidates.length);i++)await tx.expenseAllocation.update({where:{id:free[i].id},data:{userId:candidates[i].id}});
    if(free.length&&candidates.length)await reconcileExpense(tx,row.id,actorId,'Назначение доли расхода сотруднику');
  });
}
