import 'dotenv/config';
import { prisma } from '../src/lib/db';
import { repairLegacyLedger, assignReservedShares } from '../src/lib/deal-ledger';
try {
 const admin=await prisma.user.findFirstOrThrow({where:{role:'SUPER_ADMIN'}});
 await repairLegacyLedger(admin.id);
 await assignReservedShares(admin.id);
 console.log('Employee shares verified: fixed split between four people.');
} finally {await prisma.$disconnect();}
