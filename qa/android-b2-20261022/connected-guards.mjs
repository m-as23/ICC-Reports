export function parseCiCredentials(raw){
 try{const x=JSON.parse(raw);if(!x||Array.isArray(x)||Object.keys(x).sort().join(',')!=='engineer,owner,technician')throw Error();for(const k of Object.keys(x))if(typeof x[k]!=='string'||x[k].length<20||x[k].length>128)throw Error();return x;}catch{throw Error('B2_CI_CREDENTIALS_REQUIRED');}
}
export function chooseLeaveDate(rows){
 if(!Array.isArray(rows)||rows.some(r=>!/^\d{4}-\d{2}-\d{2}$/.test(r?.start)||!/^\d{4}-\d{2}-\d{2}$/.test(r?.end)||!['APPROVED','PENDING','REJECTED'].includes(r?.status)))throw Error('B2_FIXTURE_UNAVAILABLE');
 for(let i=0;i<28;i++){const d=new Date(Date.parse('2026-11-12T00:00:00Z')+i*86400000).toISOString().slice(0,10);if(!rows.some(r=>r.status!=='REJECTED'&&r.start<=d&&r.end>=d))return d;}
 throw Error('B2_FIXTURE_UNAVAILABLE');
}
