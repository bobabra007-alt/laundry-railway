import { currentUser } from '@/lib/access';
import PasswordForm from './PasswordForm';
export default async function Profile() {
  const user = await currentUser();
  return <div className="stack"><div><h1 className="title">Мой профиль</h1><p className="sub">{user.displayName} · Логин: {user.username}</p></div><div className="card stack"><h2 className="section">Смена пароля</h2><PasswordForm /></div></div>;
}
