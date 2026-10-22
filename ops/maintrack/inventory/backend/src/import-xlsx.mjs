// MainTrack 0.4.7 REVIEW-ONLY; immutable upstream 07dbac0c2a63cf58336ae8a2df383cbcf9f283be; no live credentials/deployments.
// Server-only parser for the warehouse's documented two-sheet .xlsx format.
// Never treats upload as approval, and never exposes workbook bytes to end users.
import ExcelJS from 'exceljs';
import yauzl from 'yauzl';
import {createHash} from 'node:crypto';
import {validateAndNormalizeRows} from './domain.mjs';
const MAX_FILE=10*1024*1024,MAX_UNZIPPED=48*1024*1024,MAX_ENTRIES=180,MAX_ITEMS=30000;
const clean=x=>String(x??'').normalize('NFKC').trim();
const code=x=>clean(x).toUpperCase();
const key=x=>clean(x).toLowerCase().replace(/[\s_-]+/g,'');
function safeCell(c){
 const v=c.value;
 if(v===null||v===undefined)return '';
 if(typeof v==='object'){
   if('formula' in v||'sharedFormula' in v) {
     if(v.result===null||v.result===undefined)throw new Error('FORMULA_WITHOUT_CACHED_RESULT');
     return v.result;
   }
   if('richText' in v)return v.richText.map(x=>x.text).join('');
   if('text' in v && 'hyperlink' in v)throw new Error('HYPERLINK_NOT_ALLOWED');
   throw new Error('COMPLEX_CELL_NOT_ALLOWED');
 }
 if(v instanceof Date||typeof v==='boolean')throw new Error('UNSUPPORTED_CELL_TYPE');
 return v;
}
function qty(value,line){
 if(value===null||value===undefined||clean(value)==='')throw new Error('MISSING_QUANTITY_ROW_'+line);
 const n=Number(clean(value).replace(/,/g,''));
 if(!Number.isFinite(n)||n<0||!Number.isSafeInteger(Math.round(n*10000))||Math.abs(n*10000-Math.round(n*10000))>1e-7)throw new Error('INVALID_QUANTITY_ROW_'+line);
 return n;
}
function zipPreflight(bytes){
 return new Promise((resolve,reject)=>{
  yauzl.fromBuffer(bytes,{lazyEntries:true,autoClose:true,validateEntrySizes:true},(error,zip)=>{
   if(error)return reject(new Error('INVALID_XLSX_ZIP'));
   let entries=0,total=0,closed=false;
   const fail=(e)=>{if(closed)return;closed=true;zip.close();reject(new Error(e));};
   zip.on('error',()=>fail('INVALID_XLSX_ZIP'));
   zip.on('entry',entry=>{
     if(closed)return;
     entries++;total+=entry.uncompressedSize;
     if(entries>MAX_ENTRIES||total>MAX_UNZIPPED)return fail('XLSX_UNPACK_LIMIT');
     if(entry.uncompressedSize>8*1024*1024)return fail('XLSX_ENTRY_LIMIT');
     if(entry.uncompressedSize>entry.compressedSize*250 && entry.uncompressedSize>32768)return fail('XLSX_COMPRESSION_RATIO');
     const name=entry.fileName;
     if(name.startsWith('/')||name.includes('\\')||name.split('/').includes('..')||
        /(?:^|\/)(?:vbaProject\.bin|externalLinks|embeddings)(?:\/|$)/i.test(name))
       return fail('XLSX_UNSAFE_ENTRY');
     zip.readEntry();
   });
   zip.on('end',()=>{if(!closed){closed=true;resolve();}});
   zip.readEntry();
  });
 });
}
export async function parseInventoryXlsx(input,{filename='inventory.xlsx',minItems=100}={}){
 if(!Buffer.isBuffer(input) && !(input instanceof Uint8Array))throw new Error('FILE_BYTES_REQUIRED');
 const buffer=Buffer.from(input);
 if(!/^[^\\/]{1,240}\.xlsx$/i.test(filename))throw new Error('ONLY_XLSX_ALLOWED');
 if(buffer.length<100||buffer.length>MAX_FILE)throw new Error('INVALID_FILE_SIZE');
 await zipPreflight(buffer);
 const wb=new ExcelJS.Workbook();
 try{await wb.xlsx.load(buffer);}catch{throw new Error('INVALID_XLSX_CONTENT');}
 let parts,locations;
 for(const sheet of wb.worksheets){
   if(sheet.rowCount>MAX_ITEMS+10)throw new Error('XLSX_TOO_MANY_ROWS');
   const h=sheet.getRow(1),a=key(safeCell(h.getCell(1))),b=key(safeCell(h.getCell(2))),c=key(safeCell(h.getCell(3))),f=key(safeCell(h.getCell(6)));
   if(a==='itemcode'&&b==='itemdesc'&&c==='endqty'){
     if(parts)throw new Error('DUPLICATE_PARTS_SHEET');
     parts=sheet;
   }
   if(a.includes('اكواداوركل')&&f==='location'){
     if(locations)throw new Error('DUPLICATE_LOCATION_SHEET');
     locations=sheet;
   }
 }
 if(!parts||!locations)throw new Error('REQUIRED_SHEETS_MISSING');
 const locationMap=new Map(),items=new Map();
 locations.eachRow({includeEmpty:false},(r,n)=>{
  if(n===1)return;
  const k=code(safeCell(r.getCell(1)));if(!k)return;
  if(locationMap.has(k))throw new Error('DUPLICATE_LOCATION_CODE:'+k);
  locationMap.set(k,{
   description:clean(safeCell(r.getCell(3))),
   location:clean(safeCell(r.getCell(6))),
   extra:{
    iccCode:clean(safeCell(r.getCell(2))),
    oldCard:clean(safeCell(r.getCell(4))),
    newCard:clean(safeCell(r.getCell(7))),
    drawer:clean(safeCell(r.getCell(8))),
    sourceSheet:'locations'
   }
  });
 });
 parts.eachRow({includeEmpty:false},(r,n)=>{
  if(n===1)return;
  const k=code(safeCell(r.getCell(1)));if(!k)return;
  if(items.has(k))throw new Error('DUPLICATE_PART_CODE:'+k);
  const loc=locationMap.get(k);
  items.set(k,{
   code:k,description:clean(safeCell(r.getCell(2))),
   quantity:qty(safeCell(r.getCell(3)),n),
   location:loc?.location||'',
   extra:{...(loc?.extra||{}),sourceSheet:'parts'}
  });
 });
 for(const [k,loc] of locationMap)if(!items.has(k)){
  items.set(k,{code:k,description:loc.description,quantity:null,location:loc.location,extra:loc.extra});
 }
 if(items.size<minItems||items.size>MAX_ITEMS)throw new Error('SUSPICIOUS_ITEM_COUNT:'+items.size);
 const canonical=validateAndNormalizeRows([...items.values()]);
 // Keep informational metadata, but validate mandatory fields before preserving it.
 const metadata=new Map([...items.values()].map(x=>[x.code,x.extra]));
 for(const item of canonical)item.extra=metadata.get(item.code);
 return {
  filename,
  fileSha256:createHash('sha256').update(buffer).digest('hex'),
  items:canonical,
  total:canonical.length,
  sourceSheets:{parts:parts.name,locations:locations.name}
 };
}
