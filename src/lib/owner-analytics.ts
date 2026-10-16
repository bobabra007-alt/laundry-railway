import type {ReportDeal,ReportExpense} from './analytics';
import {inPeriod,paymentTotals,type Period} from './filters';
import {round2} from './money';import {businessToday} from './dates';
type OwnerDeal=ReportDeal & {dueOn?:Date|null;expectedPaymentOn?:Date|null};
export function ownerAnalytics(deals:OwnerDeal[],expenses:ReportExpense[],period:Period,now=new Date()){
 const today=businessToday(now),byId=new Map(deals.map(d=>[d.id,d]));
 const groups=new Map<string,{id:string;name:string;count:number;turnover:number;completed:number;completedCohort:number;cancelled:number;active:number;pending:number;disputes:number;overdue:number;gross:number;cost:number;closedVolume:number;partnerDebt:number;clientDebt:number;clients:Set<string>;durations:number[]}>();
 const group=(d:OwnerDeal)=>{let g=groups.get(d.assignedTo);if(!g){g={id:d.assignedTo,name:d.assignee.displayName,count:0,turnover:0,completed:0,completedCohort:0,cancelled:0,active:0,pending:0,disputes:0,overdue:0,gross:0,cost:0,closedVolume:0,partnerDebt:0,clientDebt:0,clients:new Set(),durations:[]};groups.set(d.assignedTo,g);}return g;};
 for(const d of deals){
  const cohort=inPeriod(d.dealDate,period,true),closed=d.status==='COMPLETED'&&inPeriod(d.closedAt,period);if(!cohort&&!closed)continue;
  const g=group(d);
  if(cohort){g.count++;g.turnover+=Number(d.amount);g.clients.add(d.clientId);if(d.status==='COMPLETED')g.completedCohort++;else if(d.status==='CANCELLED')g.cancelled++;else {g.active++;if(d.status==='PENDING')g.pending++;if(d.status==='DISPUTE')g.disputes++;if(d.dueOn&&d.dueOn.toISOString().slice(0,10)<today)g.overdue++;}const payments=paymentTotals(d);g.partnerDebt+=payments.partnerDebt;g.clientDebt+=payments.clientDebt;}
  if(closed){g.completed++;g.gross+=Number(d.fee);g.closedVolume+=Number(d.amount);const days=(new Date(businessToday(d.closedAt!)).getTime()-d.dealDate.getTime())/86400000;if(days>=0)g.durations.push(days);}
 }
 for(const expense of expenses)if(expense.dealId&&inPeriod(expense.spentOn,period,true)){const d=byId.get(expense.dealId);if(d)group(d).cost+=Number(expense.amount);}
 const totalTurnover=[...groups.values()].reduce((s,g)=>s+g.turnover,0);
 return [...groups.values()].map(g=>{const sorted=g.durations.sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);return {...g,clients:g.clients.size,durations:undefined,turnover:round2(g.turnover),gross:round2(g.gross),cost:round2(g.cost),net:round2(g.gross-g.cost),averageDeal:g.count?round2(g.turnover/g.count):0,completionRate:g.count?round2(g.completedCohort/g.count*100):0,margin:g.closedVolume?round2(g.gross/g.closedVolume*100):null,averageDays:sorted.length?round2(sorted.reduce((s,x)=>s+x,0)/sorted.length):null,medianDays:sorted.length?(sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2):null,turnoverShare:totalTurnover?round2(g.turnover/totalTurnover*100):0,partnerDebt:round2(g.partnerDebt),clientDebt:round2(g.clientDebt)};}).sort((a,b)=>b.net-a.net);
}
