export const DEAL_STATUSES = {NEW:'Новая',IN_PROGRESS:'В работе',PENDING:'Ожидает',COMPLETED:'Завершена',CANCELLED:'Отменена',DISPUTE:'Спор'} as const;
export type Status = keyof typeof DEAL_STATUSES;
