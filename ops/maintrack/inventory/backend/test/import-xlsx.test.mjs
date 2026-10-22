// Generated non-sensitive workbooks only; no real inventory or secrets.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import ExcelJS from 'exceljs';
import {parseInventoryXlsx} from '../src/import-xlsx.mjs';

async function fixture({count=120,duplicate=false,negative=false,missingLocations=false}={}){
 const wb=new ExcelJS.Workbook(),parts=wb.addWorksheet('Spare Part Balance');
 parts.addRow(['Item Code','Item Desc','End Qty']);
 let locations;
 if(!missingLocations){
  locations=wb.addWorksheet('Locations');
  locations.getCell('A1').value='اكواد اوركل';
  locations.getCell('F1').value='Location';
 }
 for(let i=1;i<=count;i++){
  const code='PART-'+String(i).padStart(5,'0');
  parts.addRow([code,i===1?'Parker M700 inverter 65A 90L':'Cable '+i,negative&&i===2?-1:i===1?0:i]);
  if(locations && i<=20){const row=i+1;locations.getCell('A'+row).value=code;locations.getCell('F'+row).value='R-'+i;}
 }
 if(duplicate)parts.addRow(['PART-00001','Duplicate',1]);
 return Buffer.from(await wb.xlsx.writeBuffer());
}
test('Real ExcelJS 2-sheet XLSX parses safe approved candidate without publishing',async()=>{
 const bytes=await fixture(),p=await parseInventoryXlsx(bytes,{filename:'synthetic-stock.xlsx'});
 assert.equal(p.total,120);
 assert.deepEqual(p.sourceSheets,{parts:'Spare Part Balance',locations:'Locations'});
 assert.equal(p.fileSha256,createHash('sha256').update(bytes).digest('hex'));
 assert.equal(p.items.find(x=>x.code==='PART-00001').quantity,0);
 assert.equal(p.items.find(x=>x.code==='PART-00001').location,'R-1');
 assert.equal(p.items.find(x=>x.code==='PART-00003').description,'Cable 3');
 assert.equal(new Set(p.items.map(x=>x.code)).size,120);
 assert(!('approved' in p));
});
test('Truncated inventory <100 codes, duplicate code, negative amount and missing sheet fail closed',async()=>{
 await assert.rejects(parseInventoryXlsx(await fixture({count:8})),/SUSPICIOUS_ITEM_COUNT/);
 await assert.rejects(parseInventoryXlsx(await fixture({duplicate:true})),/DUPLICATE_PART_CODE/);
 await assert.rejects(parseInventoryXlsx(await fixture({negative:true})),/INVALID_QUANTITY/);
 await assert.rejects(parseInventoryXlsx(await fixture({missingLocations:true})),/REQUIRED_SHEETS_MISSING/);
});
test('Disguised file, unsafe filename and corrupted zip rejected',async()=>{
 const bytes=await fixture();
 await assert.rejects(parseInventoryXlsx(bytes,{filename:'../../evil.xlsx'}),/ONLY_XLSX_ALLOWED/);
 await assert.rejects(parseInventoryXlsx(bytes,{filename:'stock.xlsm'}),/ONLY_XLSX_ALLOWED/);
 await assert.rejects(parseInventoryXlsx(Buffer.alloc(200,65)),/INVALID_XLSX_ZIP/);
});
export {fixture};
