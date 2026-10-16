'use client';
import {useActionState,useEffect,useState} from 'react';
import {confirmPayout,type PayoutState} from './actions';
import {fmt} from '@/lib/money';
export default function PayoutForm({balance,today,requestId}:{balance:number;today:string;requestId:string}){
 const [state,action,pending]=useActionState(confirmPayout,{} as PayoutState);
 const [key,setKey]=useState(requestId),[amount,setAmount]=useState(''),[date,setDate]=useState(today),[note,setNote]=useState('');
 useEffect(()=>{if(state.receiptId){setKey(crypto.randomUUID());setAmount('');setNote('');}},[state.receiptId]);
 return <form action={action} className="stack payout-form" onSubmit={e=>{if(!window.confirm(`Записать получение ${amount||'0'} USDT? Подтверждайте только действительно полученные деньги.`))e.preventDefault();}}>
 <input type="hidden" name="requestId" value={key}/>
 <div className="formgrid"><div className="field"><label htmlFor="payout-amount">Фактически получил, USDT</label><input id="payout-amount" name="received" inputMode="decimal" required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00"/><button type="button" className="btn" onClick={()=>setAmount(Math.max(0,balance).toFixed(2))}>Весь остаток: {fmt(Math.max(0,balance))}</button></div>
 <div className="field"><label htmlFor="payout-date">Дата получения</label><input id="payout-date" type="date" name="receivedOn" required max={today} value={date} onChange={e=>setDate(e.target.value)}/><span className="sub">Можно указать прошлую дату, если не успели записать.</span></div>
 <div className="field full-width"><label htmlFor="payout-note">Комментарий</label><input id="payout-note" name="note" maxLength={1000} value={note} onChange={e=>setNote(e.target.value)} placeholder="Например: часть выплаты за первую половину месяца"/></div></div>
 <button className="btn primary" disabled={pending}>{pending?'Сохранение…':'Подтвердить фактическое получение'}</button>
 {state.error&&<div className="notice" role="alert">{state.error}</div>}{state.success&&<div className="success" role="status">{state.success}</div>}
 </form>;
}
