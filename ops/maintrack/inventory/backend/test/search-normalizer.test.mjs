// MT-01 — synthetic warehouse data, no real item/quantity/stock claims.
import test from 'node:test';
import assert from 'node:assert/strict';
import {inventoryTerms,filterConfirmedInventoryItems,matchesInventoryItem} from '../src/search-normalizer.mjs';
const valid={code:'DRV-M700-001',description:'Parker M700 Inverter 65A 90L',
 quantity:2,location:'RACK-7',extra:{model:'M700'}};
const bearing={code:'BRG-A-065',description:'Bearing type A size 65',quantity:100,location:'BEARING-1'};
const oversize={code:'DRV-M7000',description:'Parker inverter 165A 190L',quantity:1,location:'RACK-9'};
const stock=Object.freeze([valid,bearing,oversize]);
test('Arabic and English aliases are conservative, all tokens required',()=>{
 for(const q of ['انفرتر باركر','inverter parker','vfd Parker','انفرتير باركر M700','باركر ٦٥ أمبير']){
  assert.deepEqual(filterConfirmedInventoryItems(stock,q),[valid],q);
 }
 assert.deepEqual(inventoryTerms('٦٥ أمبير'),['65amp']);
 assert.deepEqual(inventoryTerms('۶۵ امبير'),['65amp']);
 assert.deepEqual(inventoryTerms('65 A'),['65amp']);
 assert.deepEqual(inventoryTerms('65ampere'),['65amp']);
 assert.deepEqual(inventoryTerms('90 L'),['90l']);
});
test('Numerical boundary: never return 165A for 65A, or 190L for 90L',()=>{
 for(const q of ['65 أمبير','65A','65 amp','90L','M700','m-700','Parker M700 65A']){
  assert.deepEqual(filterConfirmedInventoryItems(stock,q),[valid],q);
 }
 for(const q of ['165A','190L','M7000']){
  assert.deepEqual(filterConfirmedInventoryItems(stock,q),[oversize],q);
 }
 assert.deepEqual(filterConfirmedInventoryItems(stock,'M70'),[]);
 assert.deepEqual(filterConfirmedInventoryItems(stock,'65A Parker nonexistent'),[]);
});
test('Never infer Amp from a bare letter A and never invent or alter stock',()=>{
 assert.deepEqual(filterConfirmedInventoryItems(stock,'A'),[bearing]);
 assert.deepEqual(filterConfirmedInventoryItems(stock,'65A'),[valid]);
 assert.deepEqual(filterConfirmedInventoryItems(stock,'not in stock'),[]);
 assert.strictEqual(filterConfirmedInventoryItems(stock,'65A')[0],valid);
 assert.equal(filterConfirmedInventoryItems(stock,'65A')[0].quantity,2);
 assert.equal(matchesInventoryItem(bearing,'65amp'),false);
});
test('Only confirmed original rows, strict bounds and long descriptions',()=>{
 const veryLong={...valid,description:'Parker '+('industrial motor '.repeat(30))+' inverter 65A'};
 assert.deepEqual(filterConfirmedInventoryItems([veryLong],'Parker inverter 65A'),[veryLong]);
 assert.deepEqual(filterConfirmedInventoryItems([], 'Parker'),[]);
 assert.deepEqual(filterConfirmedInventoryItems(stock, '  '),[]);
 assert.throws(()=>filterConfirmedInventoryItems(null,'65A'),/CONFIRMED_ITEMS_REQUIRED/);
 assert.throws(()=>filterConfirmedInventoryItems(stock,'65A',{limit:200}),/INVALID_LIMIT/);
 assert.throws(()=>filterConfirmedInventoryItems(stock,'x'.repeat(121)),/INVALID_QUERY/);
 assert.deepEqual(filterConfirmedInventoryItems(stock,'Parker',{limit:1}),[valid]);
});
