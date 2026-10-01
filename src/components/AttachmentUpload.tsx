'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export default function AttachmentUpload({entityType,entityId}:{entityType:'CLIENT'|'DEAL',entityId:string}) {
  const [msg,setMsg]=useState('');const [pending,setPending]=useState(false);const router=useRouter();
  async function upload(fd:FormData) {
    const f=fd.get('file') as File;if(!f?.size)return;
    if(f.size>2*1024*1024){setMsg('Файл больше 2 МБ');return}
    fd.set('entityType',entityType);fd.set('entityId',entityId);setPending(true);setMsg('');
    try { const r=await fetch('/api/attachments',{method:'POST',body:fd});const result=await r.json();setMsg(r.ok?'Файл загружен':result.error||'Ошибка загрузки');if(r.ok)router.refresh(); }
    catch {setMsg('Не удалось загрузить файл. Попробуйте ещё раз.');}
    finally {setPending(false);}
  }
  return <form action={upload} className="split"><input type="file" name="file" required disabled={pending}/><button className="btn" disabled={pending}>{pending?'Загрузка…':'Загрузить'}</button>{msg&&<span role="status" className="sub">{msg}</span>}</form>;
}
