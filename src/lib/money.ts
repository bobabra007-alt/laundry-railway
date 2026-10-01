export function round2(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }
export function calcDeal(amount: number, partnerRate: number, clientRate: number, employeeCount = 4) {
  const partnerAmount = round2(amount * partnerRate / 100);
  const clientAmount = round2(amount * clientRate / 100);
  const fee = round2(partnerAmount - clientAmount);
  const companyShare = round2(fee * 0.75);
  const employeesShare = round2(fee * 0.25);
  const perEmployeeShare = round2(employeesShare / Math.max(employeeCount, 1));
  return { partnerAmount, clientAmount, fee, companyShare, employeesShare, perEmployeeShare };
}
export function fmt(n: number | string) {
  return `${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
}
