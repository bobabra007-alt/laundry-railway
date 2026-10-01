export function payoutWindow(now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  if (d <= 15) {
    return { start: new Date(y,m,1,0,0,0), end: new Date(y,m,15,23,59,59), due: new Date(y,m,15,12,0,0) };
  }
  const last = new Date(y,m+1,0).getDate();
  return { start: new Date(y,m,16,0,0,0), end: new Date(y,m,last,23,59,59), due: new Date(y,m,last,12,0,0) };
}
