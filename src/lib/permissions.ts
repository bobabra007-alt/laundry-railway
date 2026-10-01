export const PERMISSIONS = [
  'clients.create','clients.edit_own','clients.edit_any','clients.reassign',
  'deals.create','deals.edit_own','deals.edit_any','deals.complete',
  'partners.manage','banks.view','payouts.view_all','users.manage','audit.view'
] as const;
export type Permission = typeof PERMISSIONS[number];
