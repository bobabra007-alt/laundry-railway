'use server';
import { prisma } from '@/lib/db'; import { currentUser } from '@/lib/access'; import { revalidatePath } from 'next/cache'; import { audit } from '@/lib/audit';

export async function confirmPayout(fd: FormData) {
  const u = await currentUser();
  const periodId = String(fd.get('periodId'));
  const period = await prisma.employeePayoutPeriod.findUniqueOrThrow({ where: { id: periodId } });
  if (period.userId !== u.id) throw new Error('Можно подтверждать только свою выплату');
  if (new Date() < period.dueDate) throw new Error('Подтверждение доступно в дату выплаты');
  const due = Number(period.amountDue) + Number(period.carriedForward);
  const received = Math.max(0, Math.min(Number(fd.get('received') ?? due), due));
  const carry = Math.round((due - received) * 100) / 100;
  const status = received === due ? 'CONFIRMED' : received === 0 ? 'UNPAID' : 'PARTIAL';
  await prisma.$transaction(async tx => {
    await tx.employeePayoutPeriod.update({ where: { id: period.id }, data: { amountConfirmed: received, carriedForward: carry, status, confirmedAt: new Date() } });
    if (received > 0) { await tx.employeeLedgerEntry.create({ data: { userId: u.id, kind: 'PAYOUT', amount: -received, payoutPeriodId: period.id, note: `Подтверждённая выплата за ${period.periodStart.toLocaleDateString('ru-RU')}–${period.periodEnd.toLocaleDateString('ru-RU')}` } }); await tx.bankLedgerEntry.create({data:{bank:'EMPLOYEES',kind:'PAYOUT',amount:-received,note:`Выплата ${u.displayName}`}}); }
  });
  await audit(u.id,'CONFIRM_PAYOUT','payout_period',period.id,{due,received,carry,status});
  revalidatePath('/payouts'); revalidatePath('/');
}
