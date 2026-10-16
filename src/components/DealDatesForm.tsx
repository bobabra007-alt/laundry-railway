'use client';
import {useActionState,useState} from 'react';import {updateDealDetails} from '@/app/(app)/deals/actions';import {calcDeal,fmt} from '@/lib/money';import CounterpartyPicker from './CounterpartyPicker';
type Option={id:string;name:string};
type EditableDeal={id:string;title:string;clientId:string;partnerId:string|null;assignedTo:string;amount:number;partnerRate:number;clientRate:number;dealDate:string;dueOn:string;expectedPaymentOn:string;waitingReason:string;version:string;status:string};
export default function DealDatesForm({deal,clients,partners,owners,canReassign}:{deal:EditableDeal;clients:Option[];partners:Option[];owners:Option[];canReassign:boolean}){
 const [state,action,pending]=useActionState(updateDealDetails,{error:''});
 const [values,setValues]=useState({...deal,amount:String(deal.amount),partnerRate:String(deal.partnerRate),clientRate:String(deal.clientRate)});
 const change=(key:string,value:string)=>setValues(v=>({...v,[key]:value}));
 const numbers=[values.amount,values.partnerRate,values.clientRate].map(v=>Number(v.replace(',','.'))),valid=numbers.every(Number.isFinite),calc=valid?calcDeal(numbers[0],numbers[1],numbers[2]):null;
 return <form action={action} className="stack" onSubmit={e=>{if(deal.status==='COMPLETED'&&!window.confirm('Сохранить изменения завершённой сделки? При изменении суммы или процентов начисления будут скорректированы. Уже полученные выплаты сохранятся.'))e.preventDefault();}}>
 <input type="hidden" name="dealId" value={deal.id}/><input type="hidden" name="version" value={deal.version}/>
 <div className="formgrid"><div className="field full-width"><label htmlFor="edit-title">Название</label><input id="edit-title" name="title" value={values.title} onChange={e=>change('title',e.target.value)} required maxLength={200}/></div>
 <CounterpartyPicker prefix="client" label="Клиент" required options={clients} initial={clients.find(x=>x.id===deal.clientId)} canCreate={false}/>
 <CounterpartyPicker prefix="partner" label="Партнёр" options={partners} initial={partners.find(x=>x.id===deal.partnerId)} canCreate={false}/>
 <div className="field"><label htmlFor="edit-owner">Ответственный</label>{canReassign?<select id="edit-owner" name="assignedTo" value={values.assignedTo} onChange={e=>change('assignedTo',e.target.value)}>{owners.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>:<><input type="hidden" name="assignedTo" value={deal.assignedTo}/><span>{owners.find(x=>x.id===deal.assignedTo)?.name}</span></>}</div>
 {(['amount','partnerRate','clientRate'] as const).map((key,i)=><div className="field" key={key}><label htmlFor={'edit-'+key}>{['Сумма сделки, USDT','Процент партнёра, %','Процент клиента, %'][i]}</label><input id={'edit-'+key} name={key} inputMode="decimal" required value={values[key]} onChange={e=>change(key,e.target.value)}/></div>)}
 {(['dealDate','dueOn','expectedPaymentOn'] as const).map((key,i)=><div className="field" key={key}><label htmlFor={'edit-'+key}>{['Дата сделки','Срок исполнения','Ожидаемая дата оплаты'][i]}</label><input id={'edit-'+key} name={key} type="date" required={key==='dealDate'} value={values[key]} onChange={e=>change(key,e.target.value)}/></div>)}
 <div className="field full-width"><label htmlFor="edit-next">Причина ожидания / следующий шаг</label><textarea id="edit-next" name="waitingReason" value={values.waitingReason} onChange={e=>change('waitingReason',e.target.value)} maxLength={1000} rows={2}/></div></div>
 {calc&&<div className="calc stack"><b>После сохранения</b><div className="row"><span>Прибыль по сумме и процентам</span><b>{fmt(calc.fee)}</b></div><div className="row"><span>Компания / все сотрудники</span><b>{fmt(calc.companyShare)} / {fmt(calc.employeesShare)}</b></div><div className="row"><span>Каждому из четырёх</span><b>{fmt(calc.perEmployeeShare)}</b></div><span className="sub">Прежние получатели долей сохраняются. Выплаты не отменяются; после уменьшения прибыли баланс может стать отрицательным.</span></div>}
 <button className="btn primary" disabled={pending}>{pending?'Сохранение…':'Сохранить сделку'}</button>{state.error&&<div className="notice" role="alert">{state.error}</div>}
 </form>;
}
