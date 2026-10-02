import test from 'node:test';import assert from 'node:assert/strict';
import {calcExpense,round2} from '../src/lib/money';
import {reconcileExpense} from '../src/lib/expense-ledger';
import {payoutAmounts} from '../src/lib/payouts';
import {businessToday,parseCalendarDate} from '../src/lib/dates';
function fixture(ids:(string|null)[]=['admin','two','three','four']){
 const expense:any={id:'expense',amount:100,deletedAt:null,allocations:calcExpense(100).allocations.map((amount,slot)=>({slot,amount,userId:ids[slot]??null}))};
 const banks:any[]=[],ledger:any[]=[];
 const net=(rows:any[],query:any)=>round2(rows.filter(r=>Object.entries(query).every(([k,v])=>r[k]===v)).reduce((s,r)=>s+Number(r.amount),0));
 const tx:any={expense:{findUniqueOrThrow:async()=>expense},employeeLedgerEntry:{groupBy:async()=>[...new Set(ledger.filter(x=>x.expenseId==='expense').map(x=>x.userId))].map(userId=>({userId,_sum:{amount:net(ledger,{expenseId:'expense',userId})}})),create:async({data}:any)=>ledger.push(data)},bankLedgerEntry:{aggregate:async({where}:any)=>({_sum:{amount:net(banks,where)}}),create:async({data}:any)=>banks.push(data)},auditLog:{create:async()=>({})}};
 return {expense,banks,ledger,net,tx};
}
test('100 USDT expense costs company 75, employees 25 and each participant 6.25',()=>assert.deepEqual(calcExpense(100),{companyShare:75,employeesShare:25,allocations:[6.25,6.25,6.25,6.25]}));
test('tiny expenses preserve exact cents across both banks and four shares',()=>{for(let cents=1;cents<200;cents++){const total=cents/100,s=calcExpense(total);assert.equal(Math.round((s.companyShare+s.employeesShare)*100),cents);assert.equal(Math.round(s.allocations.reduce((a,b)=>a+b,0)*100),Math.round(s.employeesShare*100));}});
test('expense posting, editing and deleting append only differences and are idempotent',async()=>{
 const f=fixture();await reconcileExpense(f.tx,'expense','admin','create');await reconcileExpense(f.tx,'expense','admin','repeat');assert.equal(f.banks.length,2);assert.equal(f.ledger.length,4);assert.equal(f.net(f.banks,{bank:'COMPANY'}),-75);for(const id of ['admin','two','three','four'])assert.equal(f.net(f.ledger,{userId:id}),-6.25);
 f.expense.amount=200;f.expense.allocations.forEach((a:any,i:number)=>a.amount=calcExpense(200).allocations[i]);await reconcileExpense(f.tx,'expense','admin','edit');assert.equal(f.net(f.banks,{bank:'COMPANY'}),-150);assert.equal(f.net(f.banks,{bank:'EMPLOYEES'}),-50);assert.equal(f.net(f.ledger,{userId:'admin'}),-12.5);
 f.expense.deletedAt=new Date();await reconcileExpense(f.tx,'expense','admin','delete');const count=f.ledger.length;await reconcileExpense(f.tx,'expense','admin','delete again');assert.equal(f.ledger.length,count);assert.equal(f.net(f.banks,{}),0);assert.equal(f.net(f.ledger,{}),0);
});
test('observers have no allocation; reserved slots do not increase remaining participant share',async()=>{const f=fixture(['admin',null,null,null]);await reconcileExpense(f.tx,'expense','admin','create');assert.equal(f.net(f.ledger,{userId:'admin'}),-6.25);assert.equal(f.ledger.length,1);assert.equal(f.net(f.banks,{bank:'EMPLOYEES'}),-25);});
test('actual payouts survive deleting an expense and expense affects current unpaid balance',async()=>{const f=fixture();f.ledger.push({userId:'admin',kind:'PAYOUT',amount:-10});f.banks.push({bank:'EMPLOYEES',kind:'PAYOUT',amount:-10});await reconcileExpense(f.tx,'expense','admin','create');assert.equal(f.net(f.ledger,{userId:'admin'}),-16.25);f.expense.deletedAt=new Date();await reconcileExpense(f.tx,'expense','admin','delete');assert.equal(f.net(f.ledger,{userId:'admin'}),-10);assert.equal(f.net(f.banks,{bank:'EMPLOYEES'}),-10);});
test('current expenses reduce carried-forward earnings and negative balances reduce future dues',()=>{assert.deepEqual(payoutAmounts(-6.25,31.25),{amountDue:0,carriedForward:25});assert.deepEqual(payoutAmounts(31.25,-6.25),{amountDue:25,carriedForward:0});assert.deepEqual(payoutAmounts(-100,31.25),{amountDue:0,carriedForward:0});assert.deepEqual(payoutAmounts(20,30),{amountDue:20,carriedForward:30});});
test('today is calculated in Yekaterinburg and arbitrary calendar dates are validated',()=>{assert.equal(businessToday(new Date('2026-10-01T20:00:00Z')),'2026-10-02');assert.equal(parseCalendarDate('2024-02-29').toISOString(),'2024-02-29T00:00:00.000Z');assert.throws(()=>parseCalendarDate('2026-02-29'));assert.throws(()=>parseCalendarDate('not-a-date'));});
