 'use client';
import {useActionState,useState,useRef,useEffect} from 'react';
import {createExpense,updateExpense,deleteExpense, type ExpenseState} from './actions';
import {calcExpense,fmt} from '@/lib/money';
type Item={id:string;spentOn:string;description:string;amount:string;version:string};
export default function ExpenseForm({today,requestId,item}:{today:string;requestId?:string;item?:Item}){
 const [state,action,pending]=useActionState(item?updateExpense:createExpense,{} as ExpenseState);
 const [amount,setAmount]=useState(item?.amount??'');const form=useRef<HTMLFormElement>(null);
 const [key,setKey]=useState(requestId??'');
 useEffect(()=>{if(state.success&&!item){form.current?.reset();setAmount('');setKey(crypto.randomUUID());}},[state,item]);
 const n=Number(amount.replace(',','.')),split=calcExpense(Number.isFinite(n)&&n>0?n:0);
 return <form ref={form} action={action} className="stack"><input type="hidden" name="requestId" value={key}/>{item&&<><input type="hidden" name="id" value={item.id}/><input type="hidden" name="version" value={item.version}/></>}<div className="formgrid"><div className="field"><label>Дата расхода</label><input name="spentOn" type="date" defaultValue={item?.spentOn??today} required/></div><div className="field"><label>Сумма, USDT</label><input name="amount" value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder="100,00" required/></div><div className="field full-width"><label>За что потратили</label><textarea name="description" rows={2} maxLength={1000} defaultValue={item?.description} placeholder="Комиссия, услуги юриста, банкира…" required/></div></div><div className="calc"><div className="row"><span>Из банка компании — 75%</span><b>{fmt(split.companyShare)}</b></div><div className="row"><span>Из банка сотрудников — 25%</span><b>{fmt(split.employeesShare)}</b></div><div className="row"><span>Доля каждого из четырёх</span><b>{fmt(split.allocations[0])}</b></div><div className="sub">Дата — для истории. Списание учитывается в текущем периоде выплат. При округлении доли могут отличаться на 0,01 USDT.</div></div><div><button className="btn primary" disabled={pending}>{pending?'Сохранение…':item?'Сохранить изменения':'Добавить расход'}</button></div>{state.error&&<div className="notice" role="alert">{state.error}</div>}{state.success&&<div className="success" role="status">{state.success}</div>}</form>;
}
export function ExpenseDelete({id,version}:{id:string;version:string}){
 const [state,action,pending]=useActionState(deleteExpense,{} as ExpenseState);
 return <form action={action} onSubmit={e=>{if(!confirm('Удалить расход и вернуть списанные суммы в банки и личные балансы?'))e.preventDefault();}}><input type="hidden" name="id" value={id}/><input type="hidden" name="version" value={version}/><button className="btn danger" disabled={pending}>Удалить расход</button>{state.error&&<div className="notice" role="alert">{state.error}</div>}</form>;
}
