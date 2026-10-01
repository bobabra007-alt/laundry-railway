'use client';
import { useActionState } from 'react';
import { addPayment } from '@/app/(app)/deals/actions';
export default function PaymentForm({dealId,direction}:{dealId:string;direction:'PARTNER_TO_US'|'US_TO_CLIENT'}){
 const[state,action,pending]=useActionState(addPayment,{error:''});const receiving=direction==='PARTNER_TO_US';
 const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Yekaterinburg'}).format(new Date());
 return <form action={action} className="stack"><input type="hidden" name="dealId" value={dealId}/><input type="hidden" name="direction" value={direction}/><div className="field"><label>Фактическая сумма, USDT</label><input name="amount" inputMode="decimal" required placeholder="Например: 3000"/></div><div className="field"><label>Дата платежа</label><input type="date" name="paidAt" defaultValue={date} required/></div><div className="field"><label>Комментарий</label><input name="note" placeholder="Необязательно"/></div><button className="btn" disabled={pending}>{pending?'Сохранение…':receiving?'Записать получение':'Записать выплату'}</button>{state.error&&<div role="alert" className="notice">{state.error}</div>}</form>;
}
