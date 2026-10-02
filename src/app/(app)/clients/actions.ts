'use server';
import { revalidatePath } from 'next/cache'; import { prisma } from '@/lib/db'; import { currentUser, can } from '@/lib/access'; import { audit } from '@/lib/audit';
export async function createClient(fd:FormData){const u=await currentUser();if(!can(u,'clients.create')) throw new Error('Нет прав');const c=await prisma.client.create({data:{name:String(fd.get('name')),tgUsername:String(fd.get('tgUsername')||'')||null,source:String(fd.get('source')||'')||null,tags:String(fd.get('tags')||'').split(',').map(x=>x.trim()).filter(Boolean),assignedTo:String(fd.get('assignedTo')),createdBy:u.id}});await prisma.clientAssignmentHistory.create({data:{clientId:c.id,toUserId:c.assignedTo,changedBy:u.id}});await audit(u.id,'CREATE','client',c.id);revalidatePath('/clients')}
export async function reassignClient(fd:FormData){const u=await currentUser();if(!can(u,'clients.reassign')) throw new Error('Нет прав');const id=String(fd.get('id'));const to=String(fd.get('assignedTo'));const old=await prisma.client.findUniqueOrThrow({where:{id}});await prisma.client.update({where:{id},data:{assignedTo:to}});await prisma.clientAssignmentHistory.create({data:{clientId:id,fromUserId:old.assignedTo,toUserId:to,changedBy:u.id}});await audit(u.id,'REASSIGN','client',id,{from:old.assignedTo,to});revalidatePath('/clients')}

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
