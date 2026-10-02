'use server'; import { prisma } from '@/lib/db'; import { currentUser,can } from '@/lib/access'; import { revalidatePath } from 'next/cache';
export async function addPartner(fd:FormData){const u=await currentUser();if(!can(u,'partners.manage')) throw new Error('Нет прав');await prisma.partner.create({data:{name:String(fd.get('name')),tgUsername:String(fd.get('tgUsername')||'')||null,notes:String(fd.get('notes')||'')||null}});revalidatePath('/partners')}

export async function updatePartner(_: {error?:string;success?:string},fd:FormData):Promise<{error?:string;success?:string}> {
 const u=await currentUser();
 try{
  if(!can(u,'partners.manage'))throw new Error('Нет прав на редактирование партнёров');
  const id=String(fd.get('id')),name=String(fd.get('name')??'').trim(),tgUsername=String(fd.get('tgUsername')??'').trim(),notes=String(fd.get('notes')??'').trim();
  if(!name||name.length>200||tgUsername.length>200||notes.length>10000)throw new Error('Проверьте название и длину полей');
  const values={name,tgUsername:tgUsername||null,notes:notes||null,archived:fd.get('archived')==='on'};
  await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT "id" FROM "Partner" WHERE "id" = ${id} FOR UPDATE`;
   const old=await tx.partner.findUniqueOrThrow({where:{id}});
   if(old.updatedAt.toISOString()!==String(fd.get('version')))throw new Error('Данные уже изменились. Обновите страницу.');
   await tx.partner.update({where:{id},data:values});
   await tx.auditLog.create({data:{userId:u.id,action:'EDIT_PARTNER',entity:'partner',entityId:id,payload:{before:{name:old.name,tgUsername:old.tgUsername,notes:old.notes,archived:old.archived},after:values}}});
  });
  for(const path of ['/partners','/deals','/deals/new'])revalidatePath(path);
  revalidatePath('/deals/[id]','page');return {success:'Данные партнёра сохранены'};
 }catch(e){return {error:e instanceof Error?e.message:'Не удалось сохранить партнёра'};}
}
