import {prisma} from './db';
import {baseDealWhere,periodFor,priorPeriod,inPeriod,paymentMatches,paymentTotals,dateWhere,type Params,type Period} from './filters';
import {round2} from './money';import {businessToday} from './dates';
export type ReportDeal={id:string;title:string;clientId:string;partnerId:string|null;assignedTo:string;amount:unknown;partnerAmount:unknown;clientAmount:unknown;fee:unknown;companyShare:unknown;employeesShare:unknown;dealDate:Date;closedAt:Date|null;status:string;client:{name:string};partner:{name:string}|null;assignee:{displayName:string};payments:{direction:string;amount:unknown}[]};
export type ReportExpense={id:string;dealId:string|null;description:string;category:string;amount:unknown;spentOn:Date;authorId:string};
export function reportMetrics(deals:ReportDeal[],expenses:ReportExpense[],period:Period){
 const opened=deals.filter(d=>inPeriod(d.dealDate,period,true)),closed=deals.filter(d=>d.status==='COMPLETED'&&inPeriod(d.closedAt,period));
 const spend=expenses.filter(e=>inPeriod(e.spentOn,period,true));
 const turnover=round2(opened.reduce((s,d)=>s+Number(d.amount),0)),gross=round2(closed.reduce((s,d)=>s+Number(d.fee),0)),cost=round2(spend.reduce((s,e)=>s+Number(e.amount),0));
 const company=round2(closed.reduce((s,d)=>s+Number(d.companyShare),0)-spend.reduce((s,e)=>s+round2(Number(e.amount)*.75),0));
 const team=round2(closed.reduce((s,d)=>s+Number(d.employeesShare),0)-spend.reduce((s,e)=>s+round2(Number(e.amount)-round2(Number(e.amount)*.75)),0));
 const partnerDebt=round2(opened.filter(d=>d.status!=='CANCELLED').reduce((s,d)=>s+paymentTotals(d).partnerDebt,0)),clientDebt=round2(opened.filter(d=>d.status!=='CANCELLED').reduce((s,d)=>s+paymentTotals(d).clientDebt,0));
 return {turnover,count:opened.length,completed:closed.length,gross,cost,net:round2(gross-cost),company,team,average:opened.length?round2(turnover/opened.length):0,partnerDebt,clientDebt};
}
export function percentageChange(current:number,previous:number){return previous===0?null:round2((current-previous)/Math.abs(previous)*100);}
export async function loadReport(p:Params) {
 const period=periodFor(p,'month'),previousPeriod=priorPeriod(period),where=baseDealWhere(p);
 const scoped=!!(p.q||p.owner||p.client||p.partner||p.status||p.payment||p.source||p.tag||p.min||p.max||p.profitMin||p.profitMax);
 const [allDeals,allExpenses,paymentRows,staffRows]=await Promise.all([
  prisma.deal.findMany({where:{...where,deletedAt:null},include:{client:{select:{name:true}},partner:{select:{name:true}},assignee:{select:{displayName:true}},payments:{select:{direction:true,amount:true}}}}),
  prisma.expense.findMany({where:{deletedAt:null,...(p.category?{category:p.category}:{}),...(scoped?{deal:{...where,deletedAt:null}}:{})},select:{id:true,dealId:true,description:true,category:true,amount:true,spentOn:true,authorId:true}}),
  prisma.dealPayment.findMany({where:{paidAt:dateWhere(period,false),deal:where},select:{dealId:true,direction:true,amount:true}}),
  prisma.employeeLedgerEntry.findMany({where:{createdAt:dateWhere(period,false),...(p.owner?{userId:p.owner}:{})},include:{user:{select:{displayName:true}}}})
 ]);
 const deals=allDeals.filter(d=>paymentMatches(d,p.payment));const ids=new Set(deals.map(d=>d.id));
 const expenses=allExpenses.filter(e=>!p.payment||!e.dealId||ids.has(e.dealId));
 const current=reportMetrics(deals,expenses,period),previous=reportMetrics(deals,expenses,previousPeriod);
 const selectedPayments=p.payment?paymentRows.filter(x=>ids.has(x.dealId)):paymentRows;
 const received=round2(selectedPayments.filter(x=>x.direction==='PARTNER_TO_US').reduce((s,x)=>s+Number(x.amount),0)),paidClients=round2(selectedPayments.filter(x=>x.direction==='US_TO_CLIENT').reduce((s,x)=>s+Number(x.amount),0));
 const staffMap=new Map<string,{name:string;accrued:number;paid:number;periodBalance:number}>();
 for(const row of staffRows){const item=staffMap.get(row.userId)??{name:row.user.displayName,accrued:0,paid:0,periodBalance:0};if(row.kind==='PAYOUT')item.paid-=Number(row.amount);else item.accrued+=Number(row.amount);item.periodBalance+=Number(row.amount);staffMap.set(row.userId,item);}
 const staff=[...staffMap.values()].map(s=>({...s,accrued:round2(s.accrued),paid:round2(s.paid),periodBalance:round2(s.periodBalance)}));
 const buckets=new Map<string,{date:string;income:number;expenses:number}>();const monthly=!period||new Date(period.to).getTime()-new Date(period.from).getTime()>90*86400000;
 const bucket=(date:Date,calendar:boolean)=>{const key=(calendar?date.toISOString().slice(0,10):businessToday(date)).slice(0,monthly?7:10);const item=buckets.get(key)??{date:key,income:0,expenses:0};buckets.set(key,item);return item;};
 for(const d of deals)if(d.status==='COMPLETED'&&inPeriod(d.closedAt,period))bucket(d.closedAt!,false).income+=Number(d.fee);
 for(const e of expenses)if(inPeriod(e.spentOn,period,true))bucket(e.spentOn,true).expenses+=Number(e.amount);
 const series=[...buckets.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(x=>({...x,income:round2(x.income),expenses:round2(x.expenses)}));
 const breakdown=(key:'client'|'partner'|'assignee')=>{
  const groups=new Map<string,{id:string;name:string;count:number;turnover:number;gross:number;cost:number;net:number}>();
  for(const d of deals){const selected=inPeriod(d.dealDate,period,true),closed=d.status==='COMPLETED'&&inPeriod(d.closedAt,period);if(!selected&&!closed)continue;const id=key==='client'?d.clientId:key==='partner'?d.partnerId??'none':d.assignedTo;const item=groups.get(id)??{id,name:key==='client'?d.client.name:key==='partner'?d.partner?.name??'Без партнёра':d.assignee.displayName,count:0,turnover:0,gross:0,cost:0,net:0};if(selected){item.count++;item.turnover+=Number(d.amount);}if(closed)item.gross+=Number(d.fee);groups.set(id,item);}
  for(const e of expenses)if(e.dealId&&inPeriod(e.spentOn,period,true)){const d=deals.find(d=>d.id===e.dealId);if(!d)continue;const id=key==='client'?d.clientId:key==='partner'?d.partnerId??'none':d.assignedTo;const item=groups.get(id)??{id,name:key==='client'?d.client.name:key==='partner'?d.partner?.name??'Без партнёра':d.assignee.displayName,count:0,turnover:0,gross:0,cost:0,net:0};item.cost+=Number(e.amount);groups.set(id,item);}
  return [...groups.values()].map(x=>({...x,turnover:round2(x.turnover),gross:round2(x.gross),cost:round2(x.cost),net:round2(x.gross-x.cost)})).sort((a,b)=>b.net-a.net);
 };
 const categories=new Map<string,number>();for(const e of expenses)if(inPeriod(e.spentOn,period,true))categories.set(e.category,round2((categories.get(e.category)??0)+Number(e.amount)));
 return {period,previousPeriod,current,previous,received,paidClients,staff,series,clients:breakdown('client'),partners:breakdown('partner'),owners:breakdown('assignee'),categories:[...categories].map(([category,amount])=>({category,amount})),scoped};
}
