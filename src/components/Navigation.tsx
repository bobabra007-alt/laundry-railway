 'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useEffect,useState} from 'react';
export default function Navigation({admin,footer}:{admin:boolean;footer:React.ReactNode}){
 const pathname=usePathname(),[open,setOpen]=useState(false);
 useEffect(()=>{if(!open)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);},[open]);
 const links=[['/','Дашборд'],['/deals','Сделки'],['/clients','Клиенты'],['/partners','Партнёры'],['/expenses','Траты'],['/payouts','Выплаты'],['/profile','Мой профиль'],['/regulations','Регламенты'],...(admin?[['/admin/users','Пользователи'],['/admin/audit','История']]:[])];
 return <><header className="mobile-bar"><Link href="/" className="brand" onClick={()=>setOpen(false)}>Laund<span>ra</span></Link><button className="menu-button" type="button" aria-label={open?'Закрыть меню':'Открыть меню'} aria-expanded={open} aria-controls="app-sidebar" onClick={()=>setOpen(!open)}>{open?'Закрыть':'☰ Меню'}</button></header>{open&&<button className="menu-backdrop" aria-label="Закрыть меню" onClick={()=>setOpen(false)}/>}<aside id="app-sidebar" className={`side ${open?'is-open':''}`}><div className="brand desktop-brand">Laund<span>ra</span></div><nav className="nav" aria-label="Разделы приложения">{links.map(([href,label])=><Link key={href} href={href} onClick={()=>setOpen(false)} aria-current={(href==='/'?pathname==='/':pathname.startsWith(href))?'page':undefined}>{label}</Link>)}</nav><div className="side-footer">{footer}</div></aside></>;
}
