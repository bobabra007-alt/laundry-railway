export const PERMISSIONS = [
 'clients.create','clients.edit_own','clients.edit_any','clients.reassign',
 'deals.create','deals.edit_own','deals.edit_any','deals.complete',
 'partners.manage','expenses.create','expenses.edit_any','banks.view','analytics.view',
 'payouts.view_all','users.manage','audit.view'
] as const;
export type Permission = typeof PERMISSIONS[number];
export const PERMISSION_LABELS:Record<Permission,string>={
 'clients.create':'Создавать клиентов','clients.edit_own':'Изменять своих клиентов','clients.edit_any':'Изменять любых клиентов','clients.reassign':'Назначать ответственного',
 'deals.create':'Создавать сделки','deals.edit_own':'Изменять свои сделки','deals.edit_any':'Изменять любые сделки','deals.complete':'Завершать сделки',
 'partners.manage':'Управлять партнёрами','expenses.create':'Добавлять и изменять свои траты','expenses.edit_any':'Изменять любые траты',
 'banks.view':'Смотреть общие банки','analytics.view':'Смотреть аналитику','payouts.view_all':'Смотреть выплаты команды','users.manage':'Управлять пользователями','audit.view':'Смотреть историю действий'
};
export const PRESETS={
 EMPLOYEE:['clients.create','clients.edit_own','deals.create','deals.edit_own','deals.complete','expenses.create','banks.view','analytics.view'],
 OBSERVER:['banks.view','analytics.view','payouts.view_all','audit.view'],GUEST:[]
} as const;
export function hasPermission(user:{role:string;isReadOnly:boolean;permissions:{key:string;enabled:boolean}[]},key:string){
 if(user.role==='SUPER_ADMIN')return true;
 if(user.isReadOnly&&!key.endsWith('.view')&&!key.endsWith('.view_all'))return false;
 return user.permissions.some(p=>p.key===key&&p.enabled);
}
