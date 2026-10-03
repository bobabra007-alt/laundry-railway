import {businessToday} from './dates';
export function payoutWindow(now=new Date()) {
 const [y,m,d]=businessToday(now).split('-').map(Number),last=new Date(Date.UTC(y,m,0)).getUTCDate();
 const date=(day:number,time:string)=>new Date(`${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}T${time}+05:00`);
 return {start:date(d<=15?1:16,'00:00:00.000'),end:date(d<=15?15:last,'23:59:59.999'),due:date(d<=15?15:last,'12:00:00.000')};
}
export function payoutAmounts(accrual:number,priorBalance:number) {
 const total=Math.max(0,Math.round((accrual+priorBalance)*100)/100);
 const carriedForward=Math.min(Math.max(0,priorBalance),total);
 return {amountDue:Math.round((total-carriedForward)*100)/100,carriedForward};
}
