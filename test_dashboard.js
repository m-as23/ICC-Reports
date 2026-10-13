const fs=require('fs'),vm=require('vm'),assert=require('assert');
const code=fs.readFileSync(__dirname+'/Code_API.gs','utf8');
const values=[
 ['WO-01','ICC','Drawing','NIEHOFF','Motor','2026-10-04','08:00','08:30','10:00','','','Closed','Electrical'],
 ['WO-02','ICC','Drawing','NIEHOFF','Motor','2026-10-05','23:45','00:00','01:30','','','Closed','Electrical'],
 ['WO-03','ICC','Assembly','M1','Motor','2026-10-06','08:00','','','','','Open','Mechanical'],
 ['WO-04','ICC','Assembly','M1','Motor','2026-09-06','08:00','08:30','10:00','','','Closed','Mechanical']
];
const spreadsheet={getSheetByName(name){return {getLastRow:()=>values.length+1,getRange(row,col,count,width){return {getValues:()=>values.slice(row-2,row-2+count).map(r=>r.slice(col-1,col-1+width))}}}}};
const ctx={console,SpreadsheetApp:{getActive:()=>spreadsheet},Utilities:{formatDate(v){return v.toISOString().slice(0,10)}},Session:{getScriptTimeZone:()=> 'Africa/Cairo'}};
vm.createContext(ctx);vm.runInContext(code,ctx);
const d=ctx.getDashboard_(2026,10);
assert.equal(d.count,3);assert.equal(d.totalDowntime,3);assert.equal(d.mttr,1.5);assert.equal(d.machineTable.length,2);assert.equal(d.machineTable[0].name,'NIEHOFF');assert.equal(d.machineTable[0].count,2);assert.equal(d.dataQuality.complete,2);assert.equal(d.dataQuality.incomplete,1);assert.equal(d.avgResponse,.38);assert.equal(d.totalElapsed,3.75);assert.equal(d.sectionTable.length,2);assert.equal(d.categoryTable.length,2);assert.equal(d.daily.length,3);
console.log('PASS: dates, midnight crossover, 13-column report analytics, counts, hours, response time, incomplete quality, detailed tables');
