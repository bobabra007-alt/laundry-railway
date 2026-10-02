export function payoutWindow(now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  if (d <= 15) {
    return { start: new Date(y,m,1,0,0,0), end: new Date(y,m,15,23,59,59), due: new Date(y,m,15,12,0,0) };
  }
  const last = new Date(y,m+1,0).getDate();
  return { start: new Date(y,m,16,0,0,0), end: new Date(y,m,last,23,59,59), due: new Date(y,m,last,12,0,0) };
}

export function payoutAmounts(accrual:number,priorBalance:number) {
 const total=Math.max(0,Math.round((accrual+priorBalance)*100)/100);
 const carriedForward=Math.min(Math.max(0,priorBalance),total);
 return {amountDue:Math.round((total-carriedForward)*100)/100,carriedForward};
}
