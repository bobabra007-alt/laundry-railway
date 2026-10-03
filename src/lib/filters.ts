import {businessToday,parseCalendarDate} from './dates';
import {DEAL_STATUSES} from './deal-status';
export type Params=Record<string,string|undefined>;
export type Period={from:string;to:string}|null;
const iso=(d:Date)=>d.toISOString().slice(0,10);
export function periodFor(p:Params,defaultPeriod='all',now=new Date()):Period {
 const today=businessToday(now),date=parseCalendarDate(today),preset=p.period??defaultPeriod;
 if(preset==='all')return null;
 if(preset==='custom') {
  const from=p.from||today,to=p.to||today;parseCalendarDate(from);parseCalendarDate(to);
  if(from>to)throw new Error('Начало периода должно быть раньше окончания');
  return {from,to};
 }
 if(preset==='today')return {from:today,to:today};
 if(preset==='yesterday'){date.setUTCDate(date.getUTCDate()-1);return {from:iso(date),to:iso(date)};}
 if(preset==='week'){date.setUTCDate(date.getUTCDate()-6);return {from:iso(date),to:today};}
 if(preset==='month')return {from:today.slice(0,7)+'-01',to:today};
 if(preset==='previous_month'){const to=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),0));return {from:iso(new Date(Date.UTC(to.getUTCFullYear(),to.getUTCMonth(),1))),to:iso(to)};}
 return null;
}
export function priorPeriod(period:Period):Period {
 if(!period)return null;
 const from=parseCalendarDate(period.from),to=parseCalendarDate(period.to),days=Math.round((to.getTime()-from.getTime())/86400000)+1;
 return {from:iso(new Date(from.getTime()-days*86400000)),to:iso(new Date(from.getTime()-86400000))};
}
export function dateWhere(period:Period,calendar=true) {
 return period?{gte:new Date(`${period.from}T00:00:00${calendar?'Z':'+05:00'}`),lt:new Date(new Date(`${period.to}T00:00:00${calendar?'Z':'+05:00'}`).getTime()+86400000)}:undefined;
}
export function inPeriod(date:Date|string|null,period:Period,calendar=false) {
 if(!date)return false;if(!period)return true;const range=dateWhere(period,calendar)!;const time=new Date(date).getTime();return time>=range.gte.getTime()&&time<range.lt.getTime();
}
export function numberFilter(value:string|undefined){if(!value?.trim())return undefined;const n=Number(value.replace(',','.'));if(!Number.isFinite(n))throw new Error('Сумма в фильтре должна быть числом');return n;}
export function baseDealWhere(p:Params){
 const q=(p.q??'').trim().slice(0,200),min=numberFilter(p.min),max=numberFilter(p.max),profitMin=numberFilter(p.profitMin),profitMax=numberFilter(p.profitMax);
 if(min!==undefined&&max!==undefined&&min>max)throw new Error('Минимальная сумма больше максимальной');
 if(profitMin!==undefined&&profitMax!==undefined&&profitMin>profitMax)throw new Error('Минимальная прибыль больше максимальной');
 return { ...(p.status&&Object.hasOwn(DEAL_STATUSES,p.status)?{status:p.status as keyof typeof DEAL_STATUSES}:{}),
 ...(p.owner?{assignedTo:p.owner}:{}),...(p.client?{clientId:p.client}:{}),...(p.partner?{partnerId:p.partner}:{}),
 ...(q?{OR:[{title:{contains:q,mode:'insensitive' as const}},{client:{name:{contains:q,mode:'insensitive' as const}}},{partner:{name:{contains:q,mode:'insensitive' as const}}}]}:{}),
 ...(p.source||p.tag?{client:{...(p.source?{source:{contains:p.source,mode:'insensitive' as const}}:{}),...(p.tag?{tags:{has:p.tag}}:{})}}:{}),
 ...(min!==undefined||max!==undefined?{amount:{gte:min,lte:max}}:{}),...(profitMin!==undefined||profitMax!==undefined?{fee:{gte:profitMin,lte:profitMax}}:{})};
}
export function paymentTotals(d:{partnerAmount:unknown;clientAmount:unknown;payments:{direction:string;amount:unknown}[]}) {
 const received=d.payments.filter(x=>x.direction==='PARTNER_TO_US').reduce((s,x)=>s+Number(x.amount),0),paid=d.payments.filter(x=>x.direction==='US_TO_CLIENT').reduce((s,x)=>s+Number(x.amount),0);
 return {received,paid,partnerDebt:Math.max(0,Number(d.partnerAmount)-received),clientDebt:Math.max(0,Number(d.clientAmount)-paid)};
}
export function paymentMatches(d:Parameters<typeof paymentTotals>[0],filter?:string) {const t=paymentTotals(d);return filter==='partner_due'?t.partnerDebt>.005:filter==='client_due'?t.clientDebt>.005:filter==='settled'?t.partnerDebt<.005&&t.clientDebt<.005:true;}
export function queryLink(path:string,p:Params,changes:Params={}) {const q=new URLSearchParams();for(const [key,value] of Object.entries({...p,...changes}))if(value)q.set(key,value);return path+(q.size?'?'+q.toString():'');}
