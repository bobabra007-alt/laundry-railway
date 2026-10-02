export const BUSINESS_TIME_ZONE = 'Asia/Yekaterinburg';
export function businessToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: BUSINESS_TIME_ZONE, year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const get=(type:string)=>parts.find(p=>p.type===type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function parseCalendarDate(value:string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Выберите корректную дату');
  const date=new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==value) throw new Error('Выберите корректную дату');
  return date;
}
export function displayDate(date:Date) {return date.toLocaleDateString('ru-RU',{timeZone:'UTC'});}
