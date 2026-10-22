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
test('A 3,920-row synthetic stock export retains every code without silent clipping',async()=>{
 const bytes=await fixture({count:3920});
 const parsed=await parseInventoryXlsx(bytes,{filename:'synthetic-3920.xlsx'});
 assert.equal(parsed.total,3920);
 assert.equal(new Set(parsed.items.map(x=>x.code)).size,3920);
 assert.equal(parsed.items.find(x=>x.code==='PART-03920').quantity,3920);
 assert.equal(parsed.items.find(x=>x.code==='PART-00001').quantity,0);
});
test('Disguised file, unsafe filename and corrupted zip rejected',async()=>{
 const bytes=await fixture();
 await assert.rejects(parseInventoryXlsx(bytes,{filename:'../../evil.xlsx'}),/ONLY_XLSX_ALLOWED/);
 await assert.rejects(parseInventoryXlsx(bytes,{filename:'stock.xlsm'}),/ONLY_XLSX_ALLOWED/);
 await assert.rejects(parseInventoryXlsx(Buffer.alloc(200,65)),/INVALID_XLSX_ZIP/);
});
export {fixture};

test('External workbook metadata is ignored; cached quantities are read without fetching links',async()=>{
 const {createRequire}=await import('node:module');const require=createRequire(import.meta.url),JSZip=require('jszip');
 const zip=await JSZip.loadAsync(await fixture());
 zip.file('xl/externalLinks/externalLink1.xml','<externalLink xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><externalBook/></externalLink>');
 zip.file('xl/externalLinks/_rels/externalLink1.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="externalLinkPath" TargetMode="External" Target="https://must-not-fetch.invalid/stock.xlsx"/></Relationships>');
 const bytes=await zip.generateAsync({type:'nodebuffer'});const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('EXTERNAL_FETCH_FORBIDDEN');};
 try{const p=await parseInventoryXlsx(bytes);assert.equal(p.total,120);assert.equal(p.items[0].quantity,0);}finally{globalThis.fetch=original;}
 // Active content stays rejected even when externalBook metadata is accepted.
 zip.file('xl/vbaProject.bin',Buffer.alloc(100));
 await assert.rejects(parseInventoryXlsx(await zip.generateAsync({type:'nodebuffer'})),/XLSX_UNSAFE_ENTRY/);
});
test('Unavailable optional lookup metadata stays blank and never blocks authoritative balance',async()=>{
 const w=new ExcelJS.Workbook();await w.xlsx.load(await fixture());const loc=w.getWorksheet('Locations');
 loc.getCell('C2').value={formula:'VLOOKUP(A2,[1]Sheet1!A:B,2,FALSE)'};
 loc.getCell('D2').value={formula:'VLOOKUP(A2,[1]Sheet1!A:B,2,FALSE)',result:{error:'#N/A'}};
 const p=await parseInventoryXlsx(Buffer.from(await w.xlsx.writeBuffer()));
 assert.equal(p.items[0].description,'Parker M700 inverter 65A 90L');
 assert.equal(p.items[0].quantity,0);assert.equal(p.items[0].extra.oldCard,'');
 assert(!JSON.stringify(p.items).includes('[object Object]'));
});
test('Missing/error cached authoritative quantity is rejected; cached zero preserved',async()=>{
 for(const result of [undefined,{error:'#N/A'}]){
  const w=new ExcelJS.Workbook();await w.xlsx.load(await fixture());w.worksheets[0].getCell('C2').value={formula:'[1]Sheet1!C2',...(result===undefined?{}:{result})};
  await assert.rejects(parseInventoryXlsx(Buffer.from(await w.xlsx.writeBuffer())),/FORMULA_WITHOUT_CACHED_RESULT|FORMULA_ERROR_RESULT/);
 }
 const w=new ExcelJS.Workbook();await w.xlsx.load(await fixture());w.worksheets[0].getCell('C2').value={formula:'[1]Sheet1!C2',result:0};
 assert.equal((await parseInventoryXlsx(Buffer.from(await w.xlsx.writeBuffer()))).items[0].quantity,0);
});
