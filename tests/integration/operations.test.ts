import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';import {PGLiteSocketServer} from '@electric-sql/pglite-socket';
import {PrismaPg} from '@prisma/adapter-pg';import {PrismaClient} from '../../generated/prisma/client';
import {recordPayout} from '../../src/lib/payout-ledger';import {editDeal,changePayment,type DealEdit} from '../../src/lib/deal-edit';import {archiveUser} from '../../src/lib/user-lifecycle';
import {ensureAllocations,reconcileDeal} from '../../src/lib/deal-ledger';import {calcDeal} from '../../src/lib/money';

// Isolated WASM PostgreSQL; never reads DATABASE_URL or connects to a working database.
test('upgrade and financial workflows on isolated PostgreSQL',async t=>{
 const db=await PGlite.create();
 const migrations=(await readdir('prisma/migrations')).filter(x=>/^\d/.test(x)).sort();
 for(const dir of migrations.filter(x=>x<'20261016140000'))await db.exec(await readFile(`prisma/migrations/${dir}/migration.sql`,'utf8'));
 await db.exec(`INSERT INTO "User" (id,username,"displayName","passwordHash",role,"updatedAt") VALUES ('admin','admin','Admin','fixture','SUPER_ADMIN',CURRENT_TIMESTAMP),('member','member','Member','fixture','USER',CURRENT_TIMESTAMP),('third','third','Third','fixture','USER',CURRENT_TIMESTAMP),('fourth','fourth','Fourth','fixture','USER',CURRENT_TIMESTAMP);
 INSERT INTO "Client" (id,name,"assignedTo","createdBy","updatedAt") VALUES ('client','Client','admin','admin',CURRENT_TIMESTAMP);
 INSERT INTO "EmployeePayoutPeriod" (id,"userId","periodStart","periodEnd","dueDate","amountDue","amountConfirmed","carriedForward",status,"confirmedAt","updatedAt") VALUES ('legacy','admin','2026-09-30 19:00','2026-10-15 18:59:59.999','2026-10-15 07:00',100,40,60,'PARTIAL','2026-10-15 13:00',CURRENT_TIMESTAMP);
 INSERT INTO "EmployeeLedgerEntry" (id,"userId",kind,amount,"createdAt","payoutPeriodId") VALUES ('old-income','admin','ADJUSTMENT',100,'2026-10-12',NULL),('old-payout','admin','PAYOUT',-40,'2026-10-15','legacy');
 INSERT INTO "BankLedgerEntry" (id,bank,kind,amount) VALUES ('bank-income','EMPLOYEES','ADJUSTMENT',100),('bank-payout','EMPLOYEES','PAYOUT',-40);`);
 await db.exec(`INSERT INTO "Deal" (id,title,"clientId","assignedTo","createdBy",amount,"partnerRate","clientRate","partnerAmount","clientAmount",fee,"companyShare","employeesShare","perEmployeeShare","updatedAt") VALUES ('legacy-deal','Keep existing deal','client','admin','admin',1000,90,85,900,850,50,37.5,12.5,3.13,CURRENT_TIMESTAMP);
 INSERT INTO "DealPayment" (id,"dealId",direction,amount,"createdBy",note) VALUES ('legacy-payment','legacy-deal','PARTNER_TO_US',800,'admin','Keep original actual amount');`);
 const dealSnapshot=await db.query(`SELECT row_to_json(d) AS row FROM "Deal" d`),paymentSnapshot=await db.query(`SELECT row_to_json(p) AS row FROM "DealPayment" p`);
 const snapshot=await db.query(`SELECT row_to_json(p) AS row FROM "EmployeePayoutPeriod" p`),ledgerSnapshot=await db.query(`SELECT row_to_json(p) AS row FROM "EmployeeLedgerEntry" p ORDER BY id`);
 await db.exec(await readFile('prisma/migrations/20261016140000_flexible_operations/migration.sql','utf8'));
 await t.test('additive upgrade preserves existing deals, payments, confirmations and ledger',async()=>{
  assert.deepEqual((await db.query(`SELECT row_to_json(p) AS row FROM "EmployeePayoutPeriod" p`)).rows,snapshot.rows);
  assert.deepEqual((await db.query(`SELECT row_to_json(d) AS row FROM "Deal" d`)).rows,dealSnapshot.rows);
  assert.deepEqual((await db.query(`SELECT to_jsonb(p) - 'deletedAt' - 'updatedAt' AS row FROM "DealPayment" p`)).rows,paymentSnapshot.rows);
  assert.deepEqual((await db.query(`SELECT row_to_json(p) AS row FROM "EmployeeLedgerEntry" p ORDER BY id`)).rows,ledgerSnapshot.rows);
 });
 const server=new PGLiteSocketServer({db,host:'127.0.0.1',port:54339});await server.start();
 const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:'postgresql://fixture:fixture@127.0.0.1:54339/postgres',max:1})});
 const transaction=<T,>(fn:(tx:any)=>Promise<T>)=>prisma.$transaction(fn,{isolationLevel:'Serializable',timeout:20000});
 const balance=async(userId='admin')=>Number((await prisma.employeeLedgerEntry.aggregate({where:{userId},_sum:{amount:true}}))._sum.amount??0);
 const admin={id:'admin',role:'SUPER_ADMIN',isReadOnly:false,permissions:[]};
 try{
  await t.test('late confirmation on the 16th, backdated to the 15th, preserves old payout and carry',async()=>{
   await transaction(tx=>recordPayout(tx,'admin',{requestId:'late-receipt-0000001',amount:25,receivedOn:'2026-10-15',note:'late confirmation'},new Date('2026-10-16T12:00Z')));
   assert.equal(await balance(),35);assert.equal(await prisma.employeePayoutPeriod.count(),1);
   assert.deepEqual((await db.query(`SELECT row_to_json(p) AS row FROM "EmployeePayoutPeriod" p`)).rows,snapshot.rows);
  });
  await t.test('same request cannot debit twice; a later partial payment is allowed',async()=>{
   await transaction(tx=>recordPayout(tx,'admin',{requestId:'late-receipt-0000001',amount:25,receivedOn:'2026-10-15',note:''},new Date('2026-10-16T12:00Z')));
   assert.equal(await balance(),35);assert.equal(await prisma.employeePayoutReceipt.count(),1);
   await transaction(tx=>recordPayout(tx,'admin',{requestId:'partial-receipt-00002',amount:10,receivedOn:'2026-10-16',note:''},new Date('2026-10-16T12:00Z')));
   assert.equal(await balance(),25);
  });
  await t.test('zero receipt keeps balance; overpayment and future dates roll back atomically',async()=>{
   await transaction(tx=>recordPayout(tx,'admin',{requestId:'zero-receipt-0000003',amount:0,receivedOn:'2026-10-16',note:''},new Date('2026-10-16T12:00Z')));
   const before=await prisma.employeePayoutReceipt.count();
   await assert.rejects(transaction(tx=>recordPayout(tx,'admin',{requestId:'too-high-00000000004',amount:25.01,receivedOn:'2026-10-16',note:''},new Date('2026-10-16T12:00Z'))),/остаток/);
   await assert.rejects(transaction(tx=>recordPayout(tx,'admin',{requestId:'future-receipt-00005',amount:1,receivedOn:'2026-10-17',note:''},new Date('2026-10-16T12:00Z'))),/будущем/);
   assert.equal(await balance(),25);assert.equal(await prisma.employeePayoutReceipt.count(),before);
   assert.equal(Number((await prisma.bankLedgerEntry.aggregate({where:{bank:'EMPLOYEES'},_sum:{amount:true}}))._sum.amount),25);
  });
  await prisma.user.create({data:{id:'guest',username:'guest',displayName:'Guest',passwordHash:'fixture',isReadOnly:true,participatesInEmployeeBank:false}});
  await t.test('read-only account and another user request ID cannot record payouts',async()=>{
   await assert.rejects(transaction(tx=>recordPayout(tx,'guest',{requestId:'guest-receipt-000001',amount:0,receivedOn:'2026-10-16',note:''},new Date('2026-10-16T12:00Z'))),/Нет права/);
   await assert.rejects(transaction(tx=>recordPayout(tx,'member',{requestId:'late-receipt-0000001',amount:0,receivedOn:'2026-10-16',note:''},new Date('2026-10-16T12:00Z'))),/идентификатор/);
  });
  let deal=await prisma.deal.create({data:{id:'deal',title:'Historical completed',clientId:'client',assignedTo:'admin',createdBy:'admin',amount:10000,partnerRate:90,clientRate:85,...calcDeal(10000,90,85),status:'COMPLETED',closedAt:new Date('2026-10-02T12:00Z'),dealDate:new Date('2026-10-01'),allocationVersion:1}});
  await transaction(async tx=>{await ensureAllocations(tx,'deal');await reconcileDeal(tx,'deal',true,'admin','fixture');});
  deal=await prisma.deal.findUniqueOrThrow({where:{id:'deal'}});
  const input=(overrides:Partial<DealEdit>={}):DealEdit=>({version:deal.updatedAt.toISOString(),title:deal.title,clientId:'client',partnerId:null,assignedTo:'admin',amount:Number(deal.amount),partnerRate:Number(deal.partnerRate),clientRate:Number(deal.clientRate),dealDate:deal.dealDate,dueOn:null,expectedPaymentOn:null,waitingReason:null,...overrides});
  const originalSlots=await prisma.dealAllocation.findMany({where:{dealId:'deal'},orderBy:{slot:'asc'}});
  await t.test('deleting user keeps old allocations, ledger, authorship; admin protected',async()=>{
   const before=await balance('member');await transaction(tx=>archiveUser(tx,'admin','member'));
   const deleted=await prisma.user.findUniqueOrThrow({where:{id:'member'}});assert.equal(deleted.isActive,false);assert.equal(deleted.participatesInEmployeeBank,false);assert.ok(deleted.deletedAt);assert.equal(deleted.sessionVersion,1);assert.equal(await balance('member'),before);
   assert.deepEqual(await prisma.dealAllocation.findMany({where:{dealId:'deal'},orderBy:{slot:'asc'}}),originalSlots);
   await assert.rejects(transaction(tx=>archiveUser(tx,'admin','admin')),/Нельзя удалить/);
   await assert.rejects(transaction(tx=>archiveUser(tx,'third','fourth')),/администратору/);
   await assert.rejects(transaction(tx=>recordPayout(tx,'member',{requestId:'deleted-receipt-001',amount:1,receivedOn:'2026-10-16',note:''},new Date('2026-10-16T12:00Z'))),/Нет права/);
  });
  await t.test('editing a completed deal adjusts exact differences, retains original recipients, date and real payouts',async()=>{
   const before=await balance(),paymentsBefore=await prisma.employeeLedgerEntry.findMany({where:{kind:'PAYOUT'},orderBy:{id:'asc'}});
   const updated=await transaction(tx=>editDeal(tx,admin,'deal',input({amount:20000,partnerRate:90,clientRate:85})));
   assert.equal(Number(updated.fee),1000);assert.equal(updated.closedAt?.toISOString(),deal.closedAt?.toISOString());assert.equal(updated.status,'COMPLETED');assert.equal(await balance(),before+31.25);
   const slots=await prisma.dealAllocation.findMany({where:{dealId:'deal'},orderBy:{slot:'asc'}});assert.deepEqual(slots.map(s=>s.userId),originalSlots.map(s=>s.userId));assert.ok(slots.every(s=>Number(s.amount)===62.5));
   assert.deepEqual(await prisma.employeeLedgerEntry.findMany({where:{kind:'PAYOUT'},orderBy:{id:'asc'}}),paymentsBefore);
   assert.equal(Number((await prisma.bankLedgerEntry.aggregate({where:{dealId:'deal',bank:'COMPANY'},_sum:{amount:true}}))._sum.amount),750);
  });
  await t.test('stale editor rejected; unrelated edit does not post new ledger entries',async()=>{
   await assert.rejects(transaction(tx=>editDeal(tx,admin,'deal',input({amount:30000}))),/уже изменена/);
   deal=await prisma.deal.findUniqueOrThrow({where:{id:'deal'}});const count=await prisma.employeeLedgerEntry.count();
   await transaction(tx=>editDeal(tx,admin,'deal',input({title:'Renamed'})));
   assert.equal(await prisma.employeeLedgerEntry.count(),count);
  });
  await t.test('negative correction keeps prior payouts and produces a real negative balance, no payout available',async()=>{
   deal=await prisma.deal.findUniqueOrThrow({where:{id:'deal'}});
   await transaction(tx=>editDeal(tx,admin,'deal',input({partnerRate:50,clientRate:90})));
   assert.ok((await balance())<0);
   await assert.rejects(transaction(tx=>recordPayout(tx,'admin',{requestId:'negative-receipt-001',amount:0.01,receivedOn:'2026-10-16',note:''},new Date('2026-10-16T12:00Z'))),/остаток/);
   assert.equal(await prisma.employeeLedgerEntry.count({where:{kind:'PAYOUT'}}),3);
  });
  await t.test('unauthorized editors, invalid rates, and invalid counterparty cannot mutate deal',async()=>{
   deal=await prisma.deal.findUniqueOrThrow({where:{id:'deal'}});
   await assert.rejects(transaction(tx=>editDeal(tx,{id:'third',role:'USER',isReadOnly:false,permissions:[{key:'deals.edit_own',enabled:true}]},'deal',input())),/Нет права/);
   await assert.rejects(transaction(tx=>editDeal(tx,admin,'deal',input({partnerRate:101}))),/проценты/);
   await assert.rejects(transaction(tx=>editDeal(tx,admin,'deal',input({clientId:'missing'}))),/клиента/);
   assert.equal((await prisma.deal.findUniqueOrThrow({where:{id:'deal'}})).updatedAt.toISOString(),deal.updatedAt.toISOString());
  });
  await t.test('payment edit and soft deletion preserve audit history and never double change income',async()=>{
   const payment=await prisma.dealPayment.create({data:{dealId:'deal',amount:100,direction:'PARTNER_TO_US',createdBy:'admin'}}),before=await balance();
   await transaction(tx=>changePayment(tx,admin,payment.id,{version:payment.updatedAt.toISOString(),remove:false,amount:80,direction:'PARTNER_TO_US',paidAt:new Date('2026-10-15T12:00Z'),note:'actual'}));
   const updated=await prisma.dealPayment.findUniqueOrThrow({where:{id:payment.id}});assert.equal(Number(updated.amount),80);
   await transaction(tx=>changePayment(tx,admin,payment.id,{version:updated.updatedAt.toISOString(),remove:true,amount:0,direction:'PARTNER_TO_US',paidAt:new Date(),note:null}));
   assert.equal(await prisma.dealPayment.count({where:{dealId:'deal',deletedAt:null}}),0);assert.equal(await prisma.dealPayment.count({where:{dealId:'deal'}}),1);assert.equal(await balance(),before);
   assert.equal(await prisma.auditLog.count({where:{entityId:'deal',action:{in:['EDIT_PAYMENT','DELETE_PAYMENT']}}}),2);
  });
 }finally{await prisma.$disconnect();await server.stop();await db.close();}
});
