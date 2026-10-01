'use client';
import { useActionState } from 'react'; import { loginAction } from './actions';
export default function LoginForm(){ const [state,action,pending]=useActionState(loginAction,{error:''}); return <form action={action} className="stack"><div className="field"><label>Логин</label><input name="username" required autoFocus/></div><div className="field"><label>Пароль</label><input name="password" type="password" required/></div>{state.error&&<div className="notice">{state.error}</div>}<button className="btn primary" disabled={pending}>{pending?'Вход...':'Войти'}</button></form> }
