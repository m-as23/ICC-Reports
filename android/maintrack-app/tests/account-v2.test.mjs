import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateOvertime,getShiftEnd,formatQuantity} from '../update-system/account-math.mjs';

test('shift end times respect 07-15, 15-23, and overnight 23-07',()=>{
 assert.equal(getShiftEnd('2026-10-17','1'),'2026-10-17T15:00');
 assert.equal(getShiftEnd('2026-10-17','2'),'2026-10-17T23:00');
 assert.equal(getShiftEnd('2026-10-17','3'),'2026-10-18T07:00');
});

test('four actual overtime hours earn 0.5 equivalent day, not one attendance day',()=>{
 const r=calculateOvertime({mode:'extension',date:'2026-10-17',shift:'1',start:'2026-10-17T15:00',end:'2026-10-17T19:00'});
 assert.deepEqual(r,{minutes:240,hours:4,equivalentDays:0.5});
});

test('eight hours equal one equivalent day, twelve hours equal 1.5',()=>{
 for(const [end,mins,days] of [['15:00',480,1],['19:00',720,1.5]]){
 const r=calculateOvertime({mode:'separate',date:'2026-10-17',shift:'1',start:'2026-10-17T07:00',end:'2026-10-17T'+end});
 assert.equal(r.minutes,mins);assert.equal(r.equivalentDays,days);
 }
});

test('third-shift extension only begins after 07:00 next calendar day',()=>{
 const r=calculateOvertime({mode:'extension',date:'2026-10-17',shift:'3',start:'2026-10-18T07:00',end:'2026-10-18T11:00'});
 assert.equal(r.minutes,240);
 assert.throws(()=>calculateOvertime({mode:'extension',date:'2026-10-17',shift:'3',start:'2026-10-18T06:00',end:'2026-10-18T10:00'}),/BEFORE_SHIFT_END/);
});

test('minutes remain precise, so smaller overtime is never rounded to half a day',()=>{
 const r=calculateOvertime({mode:'extension',date:'2026-10-17',shift:'1',start:'2026-10-17T15:00',end:'2026-10-17T15:15'});
 assert.equal(r.minutes,15);assert.equal(r.equivalentDays,0.03125);
 assert.equal(formatQuantity(r.equivalentDays,5),'0.03125');
});

test('overlapping or negative periods, and periods above 24 hours are invalid',()=>{
 for(const [from,to] of [['2026-10-17T12:00','2026-10-17T11:00'],['2026-10-17T12:00','2026-10-17T12:00'],['2026-10-17T12:00','2026-10-19T12:01']]){
 assert.throws(()=>calculateOvertime({mode:'separate',date:'2026-10-17',shift:'1',start:from,end:to}),/INVALID_OVERTIME_RANGE/);
 }
});
