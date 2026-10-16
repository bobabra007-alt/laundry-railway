'use client';
import {useActionState} from 'react';import {deleteUser,restoreUser,type UserState} from '@/app/(app)/admin/users/actions';
export default function UserDeleteControl({id,name,deleted=false}:{id:string;name:string;deleted?:boolean}){
 const [state,action,pending]=useActionState(deleted?restoreUser:deleteUser,{} as UserState);
 return <form action={action} onSubmit={e=>{if(!window.confirm(deleted?`Восстановить ${name} в неактивном состоянии?`:`Удалить пользователя ${name}? Вход будет закрыт. Его сделки, старые доли, выплаты и баланс сохранятся. Новые доли больше не начисляются; назначение в старых сделках останется.`))e.preventDefault();}}><input type="hidden" name="userId" value={id}/><button className={`btn ${deleted?'':'danger'}`} disabled={pending}>{pending?'Сохранение…':deleted?'Восстановить':'Удалить пользователя'}</button>{state.error&&<div role="alert" className="notice">{state.error}</div>}{state.success&&<div role="status" className="success">{state.success}</div>}</form>;
}
