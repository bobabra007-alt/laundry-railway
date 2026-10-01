'use client';
import { useState } from 'react';
type Option={id:string;name:string;tgUsername?:string|null};
export default function CounterpartyPicker({label,prefix,options,required=false,canCreate=true}:{label:string;prefix:'client'|'partner';options:Option[];required?:boolean;canCreate?:boolean}){
 const [text,setText]=useState(''),[selected,setSelected]=useState<Option|null>(null),[open,setOpen]=useState(false);
 const matches=options.filter(o=>`${o.name} ${o.tgUsername||''}`.toLocaleLowerCase().includes(text.toLocaleLowerCase())).slice(0,12);
 return <div className="field picker"><label htmlFor={`${prefix}-search`}>{label}</label><input id={`${prefix}-search`} value={text} autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${prefix}-options`} placeholder={`Найти ${prefix==='client'?'клиента':'партнёра'} или ввести новое имя`} required={required} onFocus={()=>setOpen(true)} onChange={e=>{setText(e.target.value);setSelected(null);setOpen(true)}} onKeyDown={e=>{if(e.key==='Escape')setOpen(false)}} onBlur={()=>setTimeout(()=>setOpen(false),150)}/>
 <input type="hidden" name={`${prefix}Id`} value={selected?.id||''}/><input type="hidden" name={`${prefix}Name`} value={selected?'':text.trim()}/>
 {open&&<div className="picker-results" role="listbox" id={`${prefix}-options`}>{matches.map(o=><button key={o.id} type="button" role="option" aria-selected={selected?.id===o.id} onMouseDown={e=>e.preventDefault()} onClick={()=>{setSelected(o);setText(o.name);setOpen(false)}}><b>{o.name}</b>{o.tgUsername&&<span className="sub"> {o.tgUsername}</span>}</button>)}{text.trim()&&!selected&&canCreate&&<button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>setOpen(false)}>Создать: <b>{text.trim()}</b></button>}{!matches.length&&!canCreate&&<div className="sub">Совпадений нет</div>}</div>}
 <div className="sub">{selected?'Выбран существующий контакт':text.trim()?canCreate?'Будет найден или создан при сохранении сделки':'Выберите существующий контакт':prefix==='partner'?'Можно оставить без партнёра':'Новый клиент будет закреплён за вами'}</div>
 </div>;
}
