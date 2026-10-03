'use server';
import { revalidatePath } from 'next/cache'; import { prisma } from '@/lib/db'; import { currentUser, can } from '@/lib/access'; import { audit } from '@/lib/audit';
export async function createClient(_: {error?:string;success?:string},fd:FormData):Promise<{error?:string;success?:string}> {
 const u=await currentUser();if(!can(u,'clients.create'))return {error:'Нет права создавать клиентов'};
 try{const name=String(fd.get('name')??'').trim(),tgUsername=String(fd.get('tgUsername')??'').trim(),source=String(fd.get('source')??'').trim(),tags=String(fd.get('tags')??'');
 if(!name||name.length>200||tgUsername.length>200||source.length>500||tags.length>1000)throw new Error('Проверьте имя и длину полей');
 const assignedTo=can(u,'clients.reassign')?String(fd.get('assignedTo')||u.id):u.id;
 await prisma.$transaction(async tx=>{
  if(!(await tx.user.findFirst({where:{id:assignedTo,isActive:true}})))throw new Error('Выберите активного ответственного');
  const c=await tx.client.create({data:{name,tgUsername:tgUsername||null,source:source||null,tags:[...new Set(tags.split(',').map(x=>x.trim()).filter(Boolean))],assignedTo,createdBy:u.id}});
  await tx.clientAssignmentHistory.create({data:{clientId:c.id,toUserId:assignedTo,changedBy:u.id}});
  await tx.auditLog.create({data:{userId:u.id,action:'CREATE',entity:'client',entityId:c.id}});
 });revalidatePath('/clients');revalidatePath('/deals/new');return {success:'Клиент добавлен'};
 }catch(e){return {error:e instanceof Error?e.message:'Не удалось создать клиента'};}
}
export async function reassignClient(fd:FormData){
 const u=await currentUser();if(!can(u,'clients.reassign'))throw new Error('Нет прав');const id=String(fd.get('id')),to=String(fd.get('assignedTo'));
 await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT "id" FROM "Client" WHERE "id"=${id} FOR UPDATE`;
  const old=await tx.client.findUniqueOrThrow({where:{id}});if(old.assignedTo===to)return;
  if(!(await tx.user.findFirst({where:{id:to,isActive:true}})))throw new Error('Выберите активного ответственного');
  await tx.client.update({where:{id},data:{assignedTo:to}});await tx.clientAssignmentHistory.create({data:{clientId:id,fromUserId:old.assignedTo,toUserId:to,changedBy:u.id}});
  await tx.auditLog.create({data:{userId:u.id,action:'REASSIGN',entity:'client',entityId:id,payload:{from:old.assignedTo,to}}});
 });revalidatePath('/clients');revalidatePath(`/clients/${id}`);revalidatePath('/deals/new');
}
export async function updateClient(_: {error?:string;success?:string},fd:FormData):Promise<{error?:string;success?:string}> {
 const u=await currentUser();
 try {
  const id=String(fd.get('id')),name=String(fd.get('name')??'').trim();
  const tgUsername=String(fd.get('tgUsername')??'').trim(),source=String(fd.get('source')??'').trim(),tagInput=String(fd.get('tags')??'');
  const status=String(fd.get('status'));
  if(!name||name.length>200||tgUsername.length>200||source.length>500||tagInput.length>1000)throw new Error('Проверьте имя и длину заполненных полей');
  if(!['NEW','ACTIVE','VIP','ARCHIVED'].includes(status))throw new Error('Неизвестный статус');
  await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT "id" FROM "Client" WHERE "id" = ${id} FOR UPDATE`;
   const old=await tx.client.findUniqueOrThrow({where:{id}});
   if(!can(u,'clients.edit_any')&&!(old.assignedTo===u.id&&can(u,'clients.edit_own')))throw new Error('Нет прав на редактирование клиента');
   if(old.updatedAt.toISOString()!==String(fd.get('version')))throw new Error('Данные уже изменились. Обновите страницу.');
   const assignedTo=can(u,'clients.reassign')?String(fd.get('assignedTo')??old.assignedTo):old.assignedTo;
   if(assignedTo!==old.assignedTo){
    const target=await tx.user.findUnique({where:{id:assignedTo}});
    if(!target?.isActive)throw new Error('Выберите активного ответственного');
    await tx.clientAssignmentHistory.create({data:{clientId:id,fromUserId:old.assignedTo,toUserId:assignedTo,changedBy:u.id}});
   }
   const values={name,tgUsername:tgUsername||null,source:source||null,tags:[...new Set(tagInput.split(',').map(x=>x.trim()).filter(Boolean))],status:status as 'NEW'|'ACTIVE'|'VIP'|'ARCHIVED',assignedTo};
   await tx.client.update({where:{id},data:values});
   await tx.auditLog.create({data:{userId:u.id,action:'EDIT_CLIENT',entity:'client',entityId:id,payload:{before:{name:old.name,tgUsername:old.tgUsername,source:old.source,tags:old.tags,status:old.status,assignedTo:old.assignedTo},after:values}}});
  });
  for(const path of ['/clients',`/clients/${id}`,'/deals','/deals/new','/'])revalidatePath(path);
  revalidatePath('/deals/[id]','page');
  return {success:'Данные клиента сохранены'};
 }catch(e){return {error:e instanceof Error?e.message:'Не удалось сохранить клиента'};}
}
