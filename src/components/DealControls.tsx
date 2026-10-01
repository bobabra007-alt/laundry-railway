'use client';
import { useActionState,useEffect,useState } from 'react';
import { changeDealStatus,deleteDeal,restoreDeal } from '@/app/(app)/deals/actions';
import { DEAL_STATUSES,type Status } from '@/lib/deal-status';
export function StatusControl({id,status,canEdit,canComplete,isAdmin}:{id:string;status:Status;canEdit:boolean;canComplete:boolean;isAdmin:boolean}){
 const[state,action,pending]=useActionState(changeDealStatus,{error:''});const[selected,setSelected]=useState(status);
 useEffect(()=>setSelected(status),[status]);
 useEffect(()=>{if(state.error)setSelected(status);},[state,status]);
 if(!canEdit)return <span className={`badge status-${status}`}>{DEAL_STATUSES[status]}</span>;
 return <form action={action} className="status-control"><input type="hidden" name="dealId" value={id}/><select aria-label="Статус сделки" name="status" value={selected} disabled={pending} onChange={e=>{const next=e.target.value as Status;if((status==='COMPLETED'||next==='COMPLETED')&&!window.confirm(next==='COMPLETED'?'Завершить сделку и начислить прибыль?':'Изменить статус? Начисления завершённой сделки будут отменены.'))return;setSelected(next);e.currentTarget.form?.requestSubmit();}}>{Object.entries(DEAL_STATUSES).map(([value,label])=><option key={value} value={value} disabled={(value==='COMPLETED'&&!canComplete)||(status==='COMPLETED'&&!isAdmin&&value!=='COMPLETED')}>{label}</option>)}</select>{pending&&<span className="sub">Сохранение…</span>}{state.error&&<div role="alert" className="sub bad">{state.error}</div>}</form>;
}
export function DeleteControl({id,deleted=false}:{id:string;deleted?:boolean}){
 const[state,action,pending]=useActionState(deleted?restoreDeal:deleteDeal,{error:''});
 return <form action={action} onSubmit={e=>{if(!window.confirm(deleted?'Восстановить сделку? Для завершённой сделки начисления восстановятся.':'Удалить сделку? Она попадёт в архив, начисления отменятся. Платежи и история сохранятся.'))e.preventDefault();}}><input type="hidden" name="dealId" value={id}/><button className={`btn ${deleted?'':'danger'}`} disabled={pending}>{pending?'Сохранение…':deleted?'Восстановить':'Удалить'}</button>{state.error&&<div role="alert" className="sub bad">{state.error}</div>}</form>;
}
