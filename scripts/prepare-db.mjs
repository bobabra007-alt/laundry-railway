import 'dotenv/config';
import { spawnSync } from 'node:child_process';
const missing = ['DATABASE_URL', 'AUTH_SECRET', 'ADMIN_PASSWORD'].filter(key => !process.env[key]);
if (missing.length) throw new Error(`Добавьте в Railway → Variables: ${missing.join(', ')}`);
if (process.env.AUTH_SECRET.length < 32) throw new Error('AUTH_SECRET: минимум 32 символа. Используйте START-HERE.html.');
if (process.env.ADMIN_PASSWORD.length < 12 || new TextEncoder().encode(process.env.ADMIN_PASSWORD).length > 72) throw new Error('ADMIN_PASSWORD: минимум 12 символов и максимум 72 байта UTF-8.');
for (const args of [['--no-install', 'prisma', 'migrate', 'deploy'], ['--no-install', 'tsx', 'prisma/seed.ts'], ['--no-install', 'tsx', 'prisma/upgrade-ledger.ts']]) {
  const result = spawnSync('npx', args, { stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
