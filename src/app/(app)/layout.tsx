import {currentUser} from '@/lib/access';
import {signOut} from '@/auth';
import Navigation from '@/components/Navigation';
export default async function AppLayout({children}:{children:React.ReactNode}){
 const u=await currentUser();
 return <div className="shell"><Navigation admin={u.role==='SUPER_ADMIN'} footer={<><div className="sub">{u.displayName}</div><form action={async()=>{'use server';await signOut({redirectTo:'/login'})}}><button className="btn" style={{width:'100%',marginTop:8}}>Выйти</button></form></>}/><main className="main">{children}</main></div>;
}
