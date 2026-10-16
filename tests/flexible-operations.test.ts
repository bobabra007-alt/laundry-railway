import test from 'node:test';import assert from 'node:assert/strict';
import {paymentTotals,paymentMatches} from '../src/lib/filters';import {ownerAnalytics} from '../src/lib/owner-analytics';import {validateReceipt} from '../src/lib/payout-ledger';import type {ReportDeal} from '../src/lib/analytics';
const sample=(overrides:Partial<ReportDeal>={}):ReportDeal=>({id:'d',title:'Deal',clientId:'c',partnerId:null,assignedTo:'u',amount:10000,partnerAmount:9000,clientAmount:8500,fee:500,companyShare:375,employeesShare:125,dealDate:new Date('2026-10-01'),closedAt:new Date('2026-10-04T12:00Z'),status:'COMPLETED',client:{name:'Client'},partner:null,assignee:{displayName:'Owner'},payments:[{direction:'PARTNER_TO_US',amount:8000},{direction:'US_TO_CLIENT',amount:7500}],...overrides});
test('completed deals retain actual payments but cannot appear as unpaid, cancelled deals too',()=>{
 for(const status of ['COMPLETED','CANCELLED']){const d=sample({status});assert.deepEqual(paymentTotals(d),{received:8000,paid:7500,partnerDebt:0,clientDebt:0});assert.equal(paymentMatches(d,'partner_due'),false);assert.equal(paymentMatches(d,'client_due'),false);}
 assert.equal(paymentTotals(sample({status:'IN_PROGRESS'})).partnerDebt,1000);
 assert.equal(paymentTotals(sample({payments:[]})).clientDebt,0);
});
test('payout dates allowed on any day including February and month boundaries',()=>{
 for(const day of ['2026-10-01','2026-10-15','2026-10-16','2026-10-30','2026-10-31','2026-02-28'])assert.doesNotThrow(()=>validateReceipt({requestId:'receipt-test-0000001',amount:1.25,receivedOn:day,note:''},new Date('2026-11-01')));
 assert.throws(()=>validateReceipt({requestId:'receipt-test-0000001',amount:1.001,receivedOn:'2026-10-16',note:''}));
 assert.throws(()=>validateReceipt({requestId:'receipt-test-0000001',amount:-1,receivedOn:'2026-10-16',note:''}));
});
test('owner analytics uses explicit cohorts, completed margins, median, links costs only once',()=>{
 const rows=[sample(),sample({id:'d2',clientId:'c2',amount:20000,fee:1000,closedAt:new Date('2026-10-10T12:00Z')}),{...sample({id:'d3',status:'PENDING',closedAt:null,amount:5000}),dueOn:new Date('2026-10-12')},sample({id:'d4',status:'CANCELLED',closedAt:null,amount:1000})];
 const costs=[{id:'e',dealId:'d',description:'Linked',category:'OTHER',amount:100,spentOn:new Date('2026-10-03'),authorId:'other'},{id:'e2',dealId:null,description:'General',category:'OTHER',amount:400,spentOn:new Date('2026-10-03'),authorId:'u'}];
 const [r]=ownerAnalytics(rows,costs,{from:'2026-10-01',to:'2026-10-16'},new Date('2026-10-16T12:00Z'));
 assert.equal(r.count,4);assert.equal(r.completed,2);assert.equal(r.completionRate,50);assert.equal(r.active,1);assert.equal(r.pending,1);assert.equal(r.cancelled,1);assert.equal(r.overdue,1);assert.equal(r.clients,2);assert.equal(r.gross,1500);assert.equal(r.cost,100);assert.equal(r.net,1400);assert.equal(r.margin,5);assert.equal(r.averageDays,6);assert.equal(r.medianDays,6);assert.equal(r.partnerDebt,1000);
});
test('previous month deals closed now contribute income without inflating created cohort; duplicate names stay separate',()=>{
 const rows=[sample({dealDate:new Date('2026-09-01')}),sample({id:'second',assignedTo:'u2',dealDate:new Date('2026-10-02')})];
 const result=ownerAnalytics(rows,[],{from:'2026-10-01',to:'2026-10-16'});assert.equal(result.length,2);assert.equal(result.find(x=>x.id==='u')?.count,0);assert.equal(result.find(x=>x.id==='u')?.completed,1);assert.equal(result.find(x=>x.id==='u')?.margin,5);
});
