 'use server';
import {assignReservedShares,dealTransaction} from '@/lib/deal-ledger';import bcrypt from 'bcryptjs';import {prisma} from '@/lib/db';import {currentUser} from '@/lib/access';import {PERMISSIONS} from '@/lib/permissions';import {revalidatePath} from 'next/cache';
export type UserState={error?:string;success?:string};
function refresh(){for(const p of ['/admin/users','/','/payouts','/analytics'])revalidatePath(p);}
function flags(fd:FormData){const isReadOnly=fd.get('isReadOnly')==='on';return {isReadOnly,participatesInEmployeeBank:!isReadOnly&&fd.get('participatesInEmployeeBank')==='on'};}
export async function createUser(_:UserState,fd:FormData):Promise<UserState>{
 const admin=await currentUser();if(admin.role!=='SUPER_ADMIN')return {error:'Только администратор'};
 try{const username=String(fd.get('username')??'').trim(),displayName=String(fd.get('displayName')??'').trim(),password=String(fd.get('password')??''),f=flags(fd);
 if(!/^[a-zA-Z0-9_.-]{3,50}$/.test(username)||!displayName||displayName.length>100)throw new Error('Логин: 3–50 латинских букв, цифр, точек, дефисов или подчёркиваний. Укажите имя.');
 if(password.length<16||new TextEncoder().encode(password).length>72)throw new Error('Пароль: не менее 16 символов и не более 72 байт. Используйте случайный уникальный пароль.');
 const passwordHash=await bcrypt.hash(password,12),keys=PERMISSIONS.filter(k=>fd.get(k)==='on'&&(!f.isReadOnly||k.endsWith('.view')||k.endsWith('.view_all')));
 await dealTransaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(471910)`;
  if(f.participatesInEmployeeBank&&await tx.user.count({where:{isActive:true,participatesInEmployeeBank:true}})>=4)throw new Error('Четыре доли уже назначены. Для наблюдателя выключите участие в доходе.');
  const user=await tx.user.create({data:{username,displayName,passwordHash,...f}});
  if(keys.length)await tx.userPermission.createMany({data:keys.map(key=>({userId:user.id,key,enabled:true}))});
  await tx.auditLog.create({data:{userId:admin.id,action:'CREATE_USER',entity:'user',entityId:user.id,payload:{permissions:keys,...f}}});
 });await assignReservedShares(admin.id);refresh();return {success:'Пользователь создан'};
 }catch(e){return {error:(e as any)?.code==='P2002'?'Такой логин уже занят':e instanceof Error?e.message:'Не удалось создать пользователя'};}
}
export async function updatePermissions(_:UserState,fd:FormData):Promise<UserState>{
 const admin=await currentUser();if(admin.role!=='SUPER_ADMIN')return {error:'Только администратор'};
 try{const userId=String(fd.get('userId')),f=flags(fd),isActive=fd.get('isActive')==='on',keys=PERMISSIONS.filter(k=>fd.get(k)==='on'&&(!f.isReadOnly||k.endsWith('.view')||k.endsWith('.view_all')));
 await dealTransaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(471910)`;
  const target=await tx.user.findUniqueOrThrow({where:{id:userId}});if(target.role==='SUPER_ADMIN')throw new Error('Главного администратора изменять нельзя');
  if(isActive&&f.participatesInEmployeeBank&&await tx.user.count({where:{id:{not:userId},isActive:true,participatesInEmployeeBank:true}})>=4)throw new Error('У банка может быть только четыре участника');
  await tx.userPermission.deleteMany({where:{userId}});if(keys.length)await tx.userPermission.createMany({data:keys.map(key=>({userId,key,enabled:true}))});
  await tx.user.update({where:{id:userId},data:{...f,isActive,sessionVersion:{increment:1}}});
  await tx.auditLog.create({data:{userId:admin.id,action:'UPDATE_PERMISSIONS',entity:'user',entityId:userId,payload:{permissions:keys,isActive,...f}}});
 });await assignReservedShares(admin.id);refresh();return {success:'Права сохранены. Прежние сеансы пользователя завершены.'};
 }catch(e){return {error:e instanceof Error?e.message:'Не удалось сохранить права'};}
}
