import { Prisma } from '../../generated/prisma/client';
import { prisma } from './db';
import { assignReservedExpenseShares } from './expense-ledger';
import { round2, splitEmployeeShare } from './money';
type Tx = Prisma.TransactionClient;

export async function dealTransaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt=0;;attempt++) {
    try { return await prisma.$transaction(work, {isolationLevel:'Serializable', timeout:20000}); }
    catch(error) { if (attempt>=3 || !(error instanceof Prisma.PrismaClientKnownRequestError) || error.code!=='P2034') throw error; }
  }
}
export async function lockDeal(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "Deal" WHERE "id" = ${id} FOR UPDATE`;
  return tx.deal.findUniqueOrThrow({where:{id},include:{allocations:{orderBy:{slot:'asc'}}}});
}

export async function ensureAllocations(tx: Tx, id: string) {
  const deal=await tx.deal.findUniqueOrThrow({where:{id},include:{allocations:{orderBy:{slot:'asc'}}}});
  if (!deal.allocations.length) {
    const amounts=splitEmployeeShare(Number(deal.employeesShare));
    const prior=await tx.employeeLedgerEntry.findMany({where:{dealId:id,kind:'DEAL_ACCRUAL'},distinct:['userId'],select:{userId:true}});
    const active=await tx.user.findMany({where:{isActive:true,participatesInEmployeeBank:true},orderBy:[{createdAt:'asc'},{id:'asc'}],select:{id:true}});
    const ids=[...new Set([...prior.map(x=>x.userId),...active.map(x=>x.id)])].slice(0,4);
    await tx.dealAllocation.createMany({data:amounts.map((amount,slot)=>({dealId:id,slot,amount,userId:ids[slot]??null}))});
  }
  await tx.deal.update({where:{id},data:{employeeCount:4,perEmployeeShare:round2(Number(deal.employeesShare)/4),allocationVersion:1}});
}

// Reconcile the NET ledger, preserving all original records and all actual payouts.
export async function reconcileDeal(tx: Tx, id: string, posted: boolean, actorId: string, reason: string) {
  const deal=await tx.deal.findUniqueOrThrow({where:{id},include:{allocations:true}});
  for (const [bank,share] of [['COMPANY',deal.companyShare],['EMPLOYEES',deal.employeesShare]] as const) {
    const net=await tx.bankLedgerEntry.aggregate({where:{dealId:id,bank},_sum:{amount:true}});
    const delta=round2((posted?Number(share):0)-Number(net._sum.amount??0));
    if(delta)await tx.bankLedgerEntry.create({data:{dealId:id,bank,kind:'ADJUSTMENT',amount:delta,note:reason}});
  }
  const groups=await tx.employeeLedgerEntry.groupBy({by:['userId'],where:{dealId:id},_sum:{amount:true}});
  const target=new Map(deal.allocations.filter(a=>a.userId).map(a=>[a.userId!,posted?Number(a.amount):0]));
  const ids=new Set([...groups.map(g=>g.userId),...target.keys()]);
  for(const userId of ids) {
    const delta=round2((target.get(userId)??0)-Number(groups.find(g=>g.userId===userId)?._sum.amount??0));
    if(delta)await tx.employeeLedgerEntry.create({data:{userId,dealId:id,kind:'ADJUSTMENT',amount:delta,note:reason}});
  }
  await tx.deal.update({where:{id},data:{posted}});
  await tx.auditLog.create({data:{userId:actorId,action:'RECONCILE_DEAL',entity:'deal',entityId:id,payload:{posted,reason}}});
}
export async function repairLegacyLedger(actorId: string) {
  const old=await prisma.deal.findMany({where:{allocationVersion:0},select:{id:true}});
  for(const row of old)await dealTransaction(async tx=>{
    const deal=await lockDeal(tx,row.id);
    if(deal.allocationVersion!==0)return;
    await ensureAllocations(tx,row.id);
    await reconcileDeal(tx,row.id,deal.status==='COMPLETED'&&!deal.deletedAt,actorId,'Исправление деления банка сотрудников на четверых');
  });
}
export async function assignReservedShares(actorId: string) {
  const deals=await prisma.deal.findMany({where:{allocations:{some:{userId:null}}},select:{id:true}});
  for(const row of deals)await dealTransaction(async tx=>{
    const deal=await lockDeal(tx,row.id);
    const occupied=deal.allocations.map(x=>x.userId).filter(Boolean);
    const candidates=await tx.user.findMany({where:{isActive:true,participatesInEmployeeBank:true,id:{notIn:occupied as string[]}},orderBy:[{createdAt:'asc'},{id:'asc'}],select:{id:true}});
    const free=deal.allocations.filter(x=>!x.userId);
    let changed=false;
    for(let i=0;i<Math.min(free.length,candidates.length);i++){
      await tx.dealAllocation.update({where:{id:free[i].id},data:{userId:candidates[i].id}});changed=true;
    }
    if(changed)await reconcileDeal(tx,row.id,deal.posted,actorId,'Назначение сохранённой доли сотруднику');
  });
  await assignReservedExpenseShares(actorId);
}
