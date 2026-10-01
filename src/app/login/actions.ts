'use server';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
export async function loginAction(_:any, fd:FormData){
  try { await signIn('credentials',{username:fd.get('username'),password:fd.get('password'),redirectTo:'/'}); return {error:''}; }
  catch(e){ if(e instanceof AuthError) return {error:'Неверный логин или пароль'}; throw e; }
}
