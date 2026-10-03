import {createHash} from 'node:crypto';
import {prisma} from './db';
export async function allowLogin(username:string) {
 const key=createHash('sha256').update(username.trim().toLowerCase()).digest('hex');
 const rows=await prisma.$queryRaw<{attempts:number}[]>`INSERT INTO "LoginAttempt" ("key","windowStart","attempts") VALUES (${key},NOW(),1)
 ON CONFLICT ("key") DO UPDATE SET "attempts"=CASE WHEN "LoginAttempt"."windowStart"<NOW()-INTERVAL '15 minutes' THEN 1 ELSE "LoginAttempt"."attempts"+1 END,
 "windowStart"=CASE WHEN "LoginAttempt"."windowStart"<NOW()-INTERVAL '15 minutes' THEN NOW() ELSE "LoginAttempt"."windowStart" END RETURNING "attempts"`;
 return {allowed:rows[0].attempts<=10,key};
}
export async function clearLogin(key:string){await prisma.loginAttempt.deleteMany({where:{key}});}
