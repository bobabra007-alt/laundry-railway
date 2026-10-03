'use client';
import { useActionState } from 'react';
import { changePassword } from './actions';
export default function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, { error: '', success: '' });
  return <form action={action} className="stack" style={{maxWidth:460}}>
    <div className="field"><label htmlFor="currentPassword">Текущий пароль</label><input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required /></div>
    <div className="field"><label htmlFor="newPassword">Новый пароль</label><input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={16} maxLength={72} required /></div>
    <div className="field"><label htmlFor="repeatPassword">Повторите новый пароль</label><input id="repeatPassword" name="repeatPassword" type="password" autoComplete="new-password" minLength={16} maxLength={72} required /></div>
    {state.error && <div role="alert" className="notice">{state.error}</div>}
    {state.success && <div role="status" className="success">{state.success}</div>}
    <button className="btn primary" disabled={pending}>{pending ? 'Сохранение…' : 'Изменить пароль'}</button>
  </form>;
}
