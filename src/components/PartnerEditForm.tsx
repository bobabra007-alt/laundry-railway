 'use client';
import {useActionState} from 'react';
import {updatePartner} from '@/app/(app)/partners/actions';
export default function PartnerEditForm({partner}:{partner:{id:string;name:string;tgUsername:string|null;notes:string|null;archived:boolean;updatedAt:string}}){
 const [state,action,pending]=useActionState(updatePartner,{} as {error?:string;success?:string});
 return <form action={action} className="stack"><input type="hidden" name="id" value={partner.id}/><input type="hidden" name="version" value={partner.updatedAt}/><div className="formgrid"><div className="field"><label>Название</label><input name="name" defaultValue={partner.name} maxLength={200} required/></div><div className="field"><label>Telegram</label><input name="tgUsername" defaultValue={partner.tgUsername??''} maxLength={200}/></div><div className="field full-width"><label>Заметка</label><textarea name="notes" rows={3} defaultValue={partner.notes??''} maxLength={10000}/></div></div><label className="check"><input type="checkbox" name="archived" defaultChecked={partner.archived}/> В архиве — не предлагать в новых сделках</label><div><button className="btn primary" disabled={pending}>{pending?'Сохранение…':'Сохранить данные'}</button></div>{state.error&&<div role="alert" className="notice">{state.error}</div>}{state.success&&<div role="status" className="success">{state.success}</div>}</form>;
}
