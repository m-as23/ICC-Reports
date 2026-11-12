// Synthetic archive only: regression for GHSA-gmq8-994r-jv83.
import test from 'node:test';
import assert from 'node:assert/strict';
import yauzl from 'yauzl';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),JSZip=require('jszip');

test('Malformed NTFS timestamp in a real ZIP entry cannot throw out of bounds',async()=>{
 const zip=new JSZip();zip.file('synthetic.txt','safe');
 const original=await zip.generateAsync({type:'nodebuffer',compression:'STORE'});
 const central=original.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));
 const nameLength=original.readUInt16LE(central+28),extraLength=original.readUInt16LE(central+30);
 const insert=central+46+nameLength+extraLength;
 // NTFS field: 4 reserved bytes followed by one truncated tag byte.
 const malformed=Buffer.from([0x0a,0x00,0x05,0x00,0,0,0,0,1]);
 const bytes=Buffer.concat([original.subarray(0,insert),malformed,original.subarray(insert)]);
 bytes.writeUInt16LE(extraLength+malformed.length,central+30);
 const end=bytes.length-22;bytes.writeUInt32LE(bytes.readUInt32LE(end+12)+malformed.length,end+12);
 const entry=await new Promise((resolve,reject)=>yauzl.fromBuffer(bytes,{lazyEntries:true},(error,archive)=>{
  if(error)return reject(error);archive.on('error',reject);
  archive.once('entry',value=>{archive.close();resolve(value);});archive.readEntry();
 }));
 assert.equal(entry.fileName,'synthetic.txt');
 assert.doesNotThrow(()=>entry.getLastModDate());
 assert.ok(Number.isFinite(entry.getLastModDate().getTime()));
});
