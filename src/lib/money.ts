export const EMPLOYEE_COUNT = 4;
export function round2(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }
export function splitEmployeeShare(total: number) {
  const cents = Math.round(total * 100), sign = Math.sign(cents);
  const base = Math.floor(Math.abs(cents) / EMPLOYEE_COUNT), rest = Math.abs(cents) % EMPLOYEE_COUNT;
  return Array.from({length: EMPLOYEE_COUNT}, (_, index) => sign * (base + (index < rest ? 1 : 0)) / 100);
}
export function calcDeal(amount: number, partnerRate: number, clientRate: number) {
  const partnerAmount = round2(amount * partnerRate / 100), clientAmount = round2(amount * clientRate / 100);
  const fee = round2(partnerAmount - clientAmount), companyShare = round2(fee * .75);
  const employeesShare = round2(fee - companyShare), perEmployeeShare = round2(employeesShare / EMPLOYEE_COUNT);
  return {partnerAmount, clientAmount, fee, companyShare, employeesShare, perEmployeeShare};
}
export function fmt(n: number | string) {
  return `${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
}
export function inputNumber(value: FormDataEntryValue | null) {
  const n = Number(String(value ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(n)) throw new Error('Введите корректное число');
  return n;
}
