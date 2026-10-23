
'use strict';
const DATA=[];
const $=id=>document.getElementById(id);
const nf=new Intl.NumberFormat('en-US',{maximumFractionDigits:4});
const clean=x=>String(x??'').normalize('NFKC').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[ًٌٍَُِّْـ]/g,'').replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[\u200e\u200f]/g,'').replace(/[\u2010-\u2015]/g,'-').replace(/\s+/g,' ').trim();
const compact=x=>clean(x).replace(/[^\p{L}\p{N}]/gu,'');
const esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const I={copy:'<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>',pin:'<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/></svg>',id:'<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 9h4M7 13h10M7 17h7"/></svg>',arrow:'<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m9 5 7 7-7 7"/></svg>'};
const CATS={sensors:'حساسات وسويتشات',drives:'إنفرترات ودرايفات',buttons:'أزرار ومفاتيح تشغيل',bearings:'رولمان بلي',chemicals:'مواد كيماوية ولاصقة',contactors:'كونتاكتورات',heaters:'سخانات',motors:'مواتير',other:'أصناف أخرى'};
const ALIASES={sensors:['حساس','حساسات','حسايه','حساية','حساسه','سنسر','سنسور','سنسورات','sensor','sensors','proximity sensor','proximity','photoelectric','inductive sensor'],drives:['جرايب','جرايف','درايف','دريف','درايفات','درایف','انفرتر','انفرتير','انفيرتر','انفرترات','انفرترز','inverter','inverters','variable frequency drive','variable speed drive','frequency converter','vfd','ac drive','drive'],buttons:['بوش بوتون','بوش بتون','بش بوتون','بوشبوتون','زر ضغط','زرار ضغط','push button','pushbutton'],bearings:['رولمان بلي','رولمان بلى','رومان بلي','رومان بلى','رولمان','بلية','بلبرنج','bearing','ball bearing','roller bearing'],chemicals:['لوكتايد','لوكتيد','لوكتايت','loctite','لوك تايد'],contactors:['كونتاكتور','كونتكتور','contactor'],heaters:['سخان','سخانات','هيتر','heater'],motors:['موتور','ماتور','مواتير','motor']};
const TRANSLATE=[['باركر','parker'],['باركير','parker'],['لوكتايد','loctite'],['لوكتيد','loctite'],['لوكتايت','loctite'],['شنايدر','schneider'],['سيمنس','siemens'],['اوتونيكس','autonics'],['اتونيكس','autonics'],['اس كي اف','skf'],['ميتشوبيشي','mitsubishi'],['ميتسوبيشي','mitsubishi'],['دنفوس','danfoss'],['اومرون','omron'],['اي بي بي','abb']];
const BRANDS=['PARKER','CONTROL TECHNIQUES','ABB','SIEMENS','SCHNEIDER','AUTONICS','SKF','FAG','NSK','NTN','MITSUBISHI','SEW','OMRON','SICK','DELTA','LOCTITE','TELEMECANIQUE','BOSCH','ALLEN BRADLEY','DANFOSS','LS'];
const STOP=new Set(['انا','عايز','عاوزه','عاوز','بدور','دور','بدور','ابحث','ادور','عن','في','من','على','علي','اللي','الي','موجود','موجوده','موجودة','كام','عدد','قطعه','قطعة','كود','رقم','نوع','مقاس','حاجه','حاجة','عندي','عندنا','مخزن','المخزن','فيه','او','ممكن','اسمه','اسم','for','the','of','part','parts']);
function hasPhrase(hay,needle){const s=clean(hay),n=clean(needle);if(!n)return false;return new RegExp('(^|[^\\p{L}\\p{N}])'+n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^\\p{L}\\p{N}])','u').test(s)}
function categorize(x){const t=clean(x.d),c=x.c.toUpperCase();if(/^SE-(?:SNS|PRX)-/.test(c)||/\b(?:proximity|photoelectric|inductive sensor|capacitive sensor|pressure switch|sensor|transducer)\b/.test(t))return 'sensors';if(/^SE-PBT-/.test(c)||/\bpush[\s-]*button\b|\bemergency stop\b/.test(t))return 'buttons';if(/^SE-DRV-/.test(c)||/\b(?:inverter|unidrive|variable frequency drive|ac drive|servo drive)\b/.test(t))return 'drives';if(/^SM-(?:BER|BBR)-/.test(c)||/\b(?:ball bearing|roller bearing|bearing)\b|رولمان/.test(t))return 'bearings';if(/\bloctite\b|\b(?:threadlocker|super glue|adhesive)\b|مواد لاصقه/.test(t))return 'chemicals';if(/^SE-CON-/.test(c)||/\bcontactor\b/.test(t))return 'contactors';if(/\bheater\b|سخان|هيتر/.test(t))return 'heaters';if(/\bmotor\b|موتور|ماتور/.test(t))return 'motors';return 'other'}
function getBrand(t){for(const b of BRANDS){if(hasPhrase(t,b))return b==='CONTROL TECHNIQUES'?'Control Techniques':b}return ''}
function sensorKind(t){const s=clean(t);return /photoelectric/.test(s)?'Photoelectric':/pressure switch/.test(s)?'Pressure Switch':/capacitive/.test(s)?'Capacitive':/inductive|inducitive|proximity/.test(s)?'Proximity / Inductive':''}
function power(t){const m=clean(t).match(/(?:^|[^\d])(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?)\s*kw\b/);return m?m[1].replace(/\s/g,'')+' kW':''}
function voltage(t){const m=clean(t).match(/\b(24|48|110|115|120|220|230|240|380|400|415|440|460|480|500|690)\s*(?:v|vac|vdc)\b/);return m?m[1]+' V':''}
function sensorSize(t){const s=clean(t),m=s.match(/\bm\s*(8|12|18|30)\b/)||s.match(/\b(?:dia|diameter)\.?\s*:?\s*(8|12|18|30)\b/)||s.match(/\b(8|12|18|30)\s*mm\b/);return m?m[1]+' مم':''}
function sensorSignal(t){const s=clean(t),out=[];if(/\bpnp\b/.test(s))out.push('PNP');if(/\bnpn\b/.test(s))out.push('NPN');return out}
function contact(t){const s=clean(t),out=[];if(/\b(?:\d\s*)?no\b|normally[\s-]*open/.test(s))out.push('NO');if(/\b(?:\d\s*)?nc\b|normally[\s-]*closed/.test(s))out.push('NC');return out}
function buttonColor(t){const s=clean(t);for(const [eng,ar] of [['green','أخضر'],['red','أحمر'],['yellow','أصفر'],['blue','أزرق'],['black','أسود'],['white','أبيض']]){if(hasPhrase(s,eng))return ar}return ''}
function bearingKind(t){const s=clean(t);return /tapered? roller/.test(s)?'مخروطي':/needle bearing/.test(s)?'إبري':/spherical roller/.test(s)?'كروي':/thrust bearing/.test(s)?'Thrust':/deep gro(?:o)?ve/.test(s)?'Deep Groove':/ball bearing/.test(s)?'Ball Bearing':/roller bearing/.test(s)?'Roller Bearing':''}
function chemicalKind(t){const s=clean(t);return /threadlocker/.test(s)?'Threadlocker':/glue|adhesive|لاصق/.test(s)?'Glue / Adhesive':/spray|lubricant/.test(s)?'Spray / Lubricant':''}
function driveSeries(t){const m=clean(t).match(/\b(m700|m701|ac30|acs\d{3}|c200|atv\d{2,3})\b/);return m?m[1].toUpperCase():''}
const FACETS={sensors:[['kind','نوع الحساس',x=>sensorKind(x.d)],['size','القطر',x=>sensorSize(x.d)],['signal','نوع الخرج',x=>sensorSignal(x.d)],['contact','NO / NC',x=>contact(x.d)],['brand','الشركة',x=>getBrand(x.d)]],drives:[['brand','الشركة',x=>getBrand(x.d)],['series','السلسلة',x=>driveSeries(x.d)],['power','القدرة',x=>power(x.d)],['voltage','الجهد',x=>voltage(x.d)]],buttons:[['color','اللون',x=>buttonColor(x.d)],['contact','NO / NC',x=>contact(x.d)],['brand','الشركة',x=>getBrand(x.d)]],bearings:[['brand','الشركة',x=>getBrand(x.d)],['kind','نوع الرولمان',x=>bearingKind(x.d)]],chemicals:[['kind','نوع المنتج',x=>chemicalKind(x.d)],['brand','الشركة',x=>getBrand(x.d)]],contactors:[['brand','الشركة',x=>getBrand(x.d)],['voltage','الجهد',x=>voltage(x.d)]],heaters:[['voltage','الجهد',x=>voltage(x.d)],['power','القدرة',x=>power(x.d)]],motors:[['brand','الشركة',x=>getBrand(x.d)],['power','القدرة',x=>power(x.d)]]};

// ===== MainTrack V6: unit-aware, local-first adaptive search =====
// Source of truth remains each original Excel row; the search index never invents item data.
const MT6_UNIT_DEFS=[
 {k:'current',label:'تيار',unit:'A',alts:['ampere','amperes','amper','ampers','amp','amps','امبير','امبيرات','ma','a'],scale:{ampere:1,amperes:1,amper:1,ampers:1,amp:1,amps:1,'امبير':1,'امبيرات':1,ma:0.001,a:1}},
 {k:'voltage',label:'جهد',unit:'V',alts:['vdc','vac','volt','volts','فولت','فولط','v'],scale:{vdc:1,vac:1,volt:1,volts:1,'فولت':1,'فولط':1,v:1}},
 {k:'power',label:'قدرة',unit:'W',alts:['kilowatt','كيلووات','كيلو وات','kw','horsepower','حصان','hp','watt','وات','w'],scale:{kilowatt:1000,'كيلووات':1000,'كيلو وات':1000,kw:1000,horsepower:745.7,'حصان':745.7,hp:745.7,watt:1,'وات':1,w:1}},
 {k:'length',label:'طول / قطر',unit:'mm',alts:['millimeter','millimetre','millimeters','مليمتر','ملي متر','ملليمتر','ملم','ملي','مم','mm','centimeter','سنتيمتر','cm','inch','بوصه','بوصة','in'],scale:{millimeter:1,millimetre:1,millimeters:1,'مليمتر':1,'ملي متر':1,'ملليمتر':1,'ملم':1,'ملي':1,'مم':1,mm:1,centimeter:10,'سنتيمتر':10,cm:10,inch:25.4,'بوصه':25.4,'بوصة':25.4,in:25.4}},
 {k:'frequency',label:'تردد',unit:'Hz',alts:['kilohertz','كيلوهرتز','khz','hertz','هرتز','hz'],scale:{kilohertz:1000,'كيلوهرتز':1000,khz:1000,hertz:1,'هرتز':1,hz:1}},
 {k:'pressure',label:'ضغط',unit:'bar',alts:['بار','bar','psi','kpa','mpa'],scale:{'بار':1,bar:1,psi:0.0689476,kpa:0.01,mpa:10}},
 {k:'speed',label:'سرعة',unit:'rpm',alts:['rpm','r/min','لفة/دقيقة','لفه/دقيقه'],scale:{rpm:1,'r/min':1,'لفة/دقيقة':1,'لفه/دقيقه':1}},
 {k:'mass',label:'وزن',unit:'g',alts:['kilogram','كيلوجرام','كيلو جرام','kg','جرام','gram','g'],scale:{kilogram:1000,'كيلوجرام':1000,'كيلو جرام':1000,kg:1000,'جرام':1,gram:1,g:1}},
 {k:'volume',label:'حجم',unit:'ml',alts:['liter','litre','لتر','ml','مليلتر','milliliter','l'],scale:{liter:1000,litre:1000,'لتر':1000,ml:1,'مليلتر':1,milliliter:1,l:1000}}
];
// ===== V8: strict extraction of electrical-current evidence =====
// A lone "A" is *not* an ampere rating by itself. Vendor suffixes such as
// [16101 A-2Z], R410A and M700-06400420A are never rated current.
function mt8ValidCurrent(s,m,start,end,inverted,unit,itemCode=''){
 if(!['a','ma'].includes(unit))return true; // Explicitly spelled AMP/AMPERE is self-identifying.
 const prefix=s.slice(Math.max(0,start-36),start);
 const suffix=s.slice(end,Math.min(s.length,end+18));
 const all=s;
 const c=String(itemCode||'').toUpperCase();
 // A user query containing a declared unit is an instruction, not a product description.
 if(c==='__QUERY__')return true;
 // Detection is based on the description, NOT a raw substring match on item code.
 // Embedded catalogue model numbers in [brackets] are ambiguous by definition.
 const before=s.slice(0,start);
 const inSquare=before.lastIndexOf('[')>before.lastIndexOf(']');
 if(inSquare)return false;
 // Parenthesized tokens after 'MODEL:' or 'TYPE:' are model suffixes, not ratings.
 const inParen=before.lastIndexOf('(')>before.lastIndexOf(')');
 if(inParen && /(?:\bmodel\b|\btype\b|\bpart\s*no\b|\bcode\b|\bsku\b)\s*:?\s*\($/i.test(before.slice(-34)))return false;
 // Number embedded in hyphen/slash model identifiers, e.g. 40/160A, M700-xxxxA.
 if(start>0&&['/','-','_'].includes(s[start-1]))return false;
 // Suffix continuing a part number, e.g. 16101 A-2Z, 385A/383A.
 if(s[end]==='-' && /[a-z\d]/i.test(s[end+1]||''))return false;
 // Refrigerant R410A / R134A is a refrigerant designation, never an electrical rating.
 if(/(?:\b(?:r|freon|refrigerant|فريون)\s*)$/i.test(prefix))return false;
 if(/(?:\bfreon\b|\brefrigerant\b|فريون)/i.test(all) && !/(?:\b(?:volt|voltage|current|ampere|amperes|amps?)\b|\d\s*(?:vac|vdc|volt)\b)/i.test(all))return false;
 // Very large isolated values are highly suggestive of part numbering, not rated current.
 const val=Number(m.groups.num.replace(',','.'));
 if(val>6000)return false;
 const knownElectrical=/(?:\b(?:ampere|amperes|amps?|current|rated|rating|electrical|circuit\s*breaker|breaker|fuse|contactor|relay|switch|plug|socket|battery|drive|inverter|vfd|power\s*supply|thyristor|rectifier|sensor|module|motor|terminal|connector|output|input|poles?|pole|vac|vdc|ac\b|dc\b|volt|voltage|kw|kva|watt)\b|\b\d+(?:\.\d+)?\s*(?:v|vac|vdc|kw)\b|(?:فيوز|كونتاكتور|سويتش|بريزة|فيشة|سخانه|سخان|موتور|كهرب|امبير|تيار|ثايرستور|ريلاي|بطاري|كرنت|سكينه|سكينة|مانوال))/iu.test(all);
 // Bare "A 65" is intentionally accepted only in electrical/fuse contexts.
 if(inverted && /\bac-\d{1,3}\s*$/i.test(prefix))return false; // AC-23 A 400V describes utilization class, not 400 A.
 if(inverted && !knownElectrical)return false;
 // For compact 25A, 10 A, 0.5A etc, electrical context must be present.
 if(!knownElectrical)return false;
 // Additional guard for non-electrical parts not explicitly rated in amperes.
 if(/^(?:SM|ST|SW|SA|SC)-/.test(c)){
   const concrete=/(?:\b(?:battery|electric|current|rated\s*current|output\s*current|input\s*current|ampere|amperes|amps?|circuit\s*breaker|contactor|fuse|relay|switch|socket|power\s*supply)\b|(?:تيار|امبير|كهرب|فيوز|كونتاكتور|بطاري))/iu.test(all);
   if(!concrete)return false;
 }
 return true;
}

// ==== V9: systematic specification extraction safeguards ====
// A physical quantity is a value WITH a verifiable unit and a source span.
// Model/part identifiers can contain unit-looking letters but are not measurements.
function mt9GuardMeasurement(s,m,start,end,inverted,unit,def,itemCode){
 const tail=s.slice(end,Math.min(s.length,end+20));
 const prev=s.slice(Math.max(0,start-22),start);
 const code=String(itemCode||'').toUpperCase();
 if(code==='__QUERY__')return true; // Users explicitly specify units in their questions.
 const text=s.toLowerCase();
 const square=s.lastIndexOf('[',start)>s.lastIndexOf(']',start);
 const round=s.lastIndexOf('(',start)>s.lastIndexOf(')',start);
 const cnum=Number(m.groups.num.replace(',','.'));
 const isAbbrev=unit.length<=2;
 // An isolated suffix in a model like oil 15W-50 or motor [90L/4] is not power or volume.
 // Square brackets alone do not imply a model; [240 MM / 16 MM] can contain real dimensions.
 if(square && isAbbrev && /^\s*[-/]\s*\d/.test(tail) && ['l','w'].includes(unit) && /(?:model|type|[a-z]\d+)/i.test(s.slice(Math.max(0,start-28),start)))return false;
 if((def.k==='power'&&unit==='w'&&/^\s*-\s*\d/.test(tail) && /(?:oil|lubricant|grease|زيت|شحوم)/i.test(text)))return false;
 if((def.k==='volume'&&unit==='l'&&/^\s*\/\s*\d/.test(tail)))return false;
 if(def.k==='voltage'&&inverted&&/^\s*\/\s*\d/.test(tail))return false;
 // A value preceded by another number and slash may be a fraction or a dual rating.
 // The independent typed compound parser below resolves those deliberately.
 if(start>0 && s[start-1]=='/' && /\d/.test(s[start-2]||''))return false;
 if(start>0 && s[start-1]==='-' && /\d/.test(s[start-2]||'') && square && isAbbrev)return false;
 // Ratings inside catalogue model parentheses such as (ABC-150W-220) are not declared specs.
 if(round && isAbbrev && /^[\s]*[-/]\d/.test(tail))return false;
 // Reject common coded protection classes and oil viscosity from generic unit detection.
 if(def.k==='power'&&unit==='w'&&/\b(?:5w|10w|15w|20w|0w)\s*[-–]\s*\d{2,3}\b/i.test(text)&&/\b(?:oil|lubricant|زيت)\b/i.test(text))return false;
 return true;
}
function mt9AddCompoundMeasurements(s,matches,code){
 const defs=['current','voltage','power','frequency','speed','pressure','mass','volume','length'];
 for(const def of MT6_UNIT_DEFS){
  if(!defs.includes(def.k))continue;
  const alts=[...def.alts].sort((a,b)=>b.length-a.length).map(a=>mt6EscRe(clean(a))).join('|');
  const re=new RegExp('(?<![\\p{L}\\p{N}])(?<a>\\d+(?:[.,]\\d+)?)[ \\t]*\\/[ \\t]*(?<b>\\d+(?:[.,]\\d+)?)[ \\t]*(?<unit>'+alts+')(?=$|[^\\p{L}\\p{N}])','giu');
  for(const m of s.matchAll(re)){
   const start=m.index,end=start+m[0].length,u=clean(m.groups.unit);
   const preceding=s.slice(Math.max(0,start-18),start);
   if(/\d\s*\/\s*$/.test(preceding))continue; // 380/3/50 V is a multi-field motor nameplate.
   if(/\d\s*[×x*]\s*$/.test(preceding)||/[×x*]\s*\d+\s*$/.test(preceding))continue; // Dimensions followed by '/600W'.
   if(/[\p{L}]/u.test(preceding.slice(-1))&&m.groups.a.length<=2&&u.length<=2)continue;
   const a=Number(m.groups.a.replace(',','.')),b=Number(m.groups.b.replace(',','.'));
   if(!Number.isFinite(a)||!Number.isFinite(b)||b===0||!def.scale[u])continue;
   // Short unit suffix inside an encoded model can masquerade as a specification.
   const square=s.lastIndexOf('[',start)>s.lastIndexOf(']',start);
   if(square && u.length<=2 && !/\b(?:volt|ampere|current|kw|watt|power|speed|rpm|pressure|capacity)\b|(?:جهد|تيار|قدره|قدرة)/iu.test(s.slice(Math.max(0,start-35),start)))continue;
   // Allow true fractions for packaging: 1/4 KG, 1/2 L. Not 4KG or 2L.
   const fractional=Number.isInteger(a)&&Number.isInteger(b)&&a<b&&b<=100 && (
      ['mass','volume'].includes(def.k) || (def.k==='length'&&['inch','بوصة','بوصه','in'].includes(u)&&b<=16) || (def.k==='power'&&['hp','حصان','horsepower'].includes(u)&&b<=16));
   const dual=['current','voltage','power','frequency','speed','pressure','length'].includes(def.k)&&!fractional;
   if(!fractional&&!dual)continue;
   // Inch fractions like 4/3 are ambiguous or component shorthand, not two inch ratings.
   if(def.k==='length' && ['inch','بوصه','بوصة','in'].includes(u) && a>=b && a<=16&&b<=16)continue;
   if(dual&&Math.max(a,b)/Math.min(a||.000001,b)>10)continue; // transformer ratios are not independent part ratings.
   if(dual && (a<0.0001||b<0.0001))continue;
   const pseudo={groups:{num:String(b),unit:u}};
   if(def.k==='current'&&!mt8ValidCurrent(s,pseudo,start,end,false,u,code))continue;
   // Delete standalone trailing values extracted from the same compound span.
   for(let j=matches.length-1;j>=0;j--)if(matches[j].k===def.k&&matches[j].start>=start&&matches[j].end<=end)matches.splice(j,1);
   const multiplier=def.scale[u];
   const values=fractional?[a/b]:[a,b];
   for(const value of values){matches.push({k:def.k,label:def.label,unit:def.unit,value:value*multiplier,raw:m[0],start,end,confidence:fractional?'fraction':'multi-rating',sourceUnit:u})}
  }
 }
}

const MT6_MEMO=new Map();
function mt6EscRe(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function mt6FindMeasurements(raw,itemCode=''){
 const s=clean(raw),key=s+'|'+itemCode,memo=MT6_MEMO.get(key);if(memo)return memo;
 const matches=[],occupied=[];
 for(const def of MT6_UNIT_DEFS){
  const alts=[...def.alts].sort((a,b)=>b.length-a.length).map(a=>mt6EscRe(clean(a))).join('|');
  const fwd=new RegExp('(?<![\\p{L}\\p{N}])(?<num>\\d+(?:[.,]\\d+)?)[ \\t]*(?<unit>'+alts+')(?=$|[^\\p{L}\\p{N}])','giu');
  // Inverted electrical labels are common in the original inventory: "A 65 / V 110".
  const back=def.k==='current'||def.k==='voltage' ? new RegExp('(?<![\\p{L}\\p{N}-])(?<unit>'+alts+')[ \\t]+(?<num>\\d+(?:[.,]\\d+)?)(?=$|[^\\p{L}\\p{N}])','giu'):null;
  for(const [pattern,inverted] of [[fwd,false],[back,true]]){
   if(!pattern)continue;
   for(const m of s.matchAll(pattern)){
    const start=m.index,end=start+m[0].length;
    if(occupied.some(r=>start<r[1]&&end>r[0]))continue;
    const unit=clean(m.groups.unit),val=Number(m.groups.num.replace(',','.'));
    if(def.k==='current'&&unit==='ma'&&(inverted||(start>0&&s[start-1]==='/')))continue;
    if(!Number.isFinite(val)||val<0||!Object.prototype.hasOwnProperty.call(def.scale,unit))continue;
    if(def.k==='current'&&!mt8ValidCurrent(s,m,start,end,inverted,unit,itemCode))continue;
    if(!mt9GuardMeasurement(s,m,start,end,inverted,unit,def,itemCode))continue;
    occupied.push([start,end]);
    matches.push({k:def.k,label:def.label,unit:def.unit,value:val*def.scale[unit],raw:m[0],start,end,confidence:inverted?'interpreted':'explicit',sourceUnit:unit});
   }
  }
 }
 mt9AddCompoundMeasurements(s,matches,itemCode);
 matches.sort((a,b)=>a.start-b.start);
 if(MT6_MEMO.size>18000)MT6_MEMO.clear();MT6_MEMO.set(key,matches);return matches;
}
const MT6_FUNCTIONAL=[
 {r:/(?:يتحكم|التحكم|بتتحكم|بغير|تغيير|تحكم).{0,28}(?:سرعه|سرعة).{0,25}(?:موتور|محرك|motor)|(?:سرعه|سرعة).{0,12}(?:الموتور|المحرك)/u,category:'drives'},
 {r:/(?:يكشف|بيكشف|كشف|استشعار).{0,25}(?:معدن|حديد|metal)/u,category:'sensors'},
 {r:/(?:لزق|لصق|تثبيت).{0,22}(?:قلاووظ|مسامير|سن|thread)/u,category:'chemicals'}
];

// ===== V7: Concept-based query and measurement index =====
// Use unambiguous FULL unit names only. Single-letter units like A or V alone
// are intentionally NOT converted, because those tokens are common in model IDs.
const MT7_CONCEPTS=[
 {k:'current',name:'التيار الكهربائي',unit:'A',aliases:['امبيرات','امبير','ampere','amperes','amper','ampers','amps','amp']},
 {k:'voltage',name:'الجهد الكهربائي',unit:'V',aliases:['فولت','فولط','volt','volts']},
 {k:'power',name:'القدرة',unit:'W',aliases:['كيلو وات','كيلووات','kilowatt','kilowatts','حصان','horsepower','watt','watts','وات']},
 {k:'length',name:'الطول أو القطر',unit:'mm',aliases:['ملليمتر','مليمتر','ملي متر','millimeter','millimetre','millimeters','millimetres','سنتيمتر','centimeter','centimetre','بوصه','بوصة','inch','inches','ملم','مم','mm']},
 {k:'pressure',name:'الضغط',unit:'bar',aliases:['ضغط','pressure','psi','بار','bar']},
 {k:'frequency',name:'التردد',unit:'Hz',aliases:['هرتز','hertz','kilohertz']},
 {k:'speed',name:'سرعة الدوران',unit:'rpm',aliases:['دورة/دقيقة','لفه/دقيقه','لفة/دقيقة','rpm']},
 {k:'mass',name:'الوزن',unit:'g',aliases:['جرام','كيلوجرام','kilogram','gram']},
 {k:'volume',name:'الحجم',unit:'ml',aliases:['لتر','liter','litre','مليلتر','milliliter']}
];
function mt7ReadConcepts(raw){
 let text=clean(raw), kinds=[], names=[];
 for(const concept of MT7_CONCEPTS){
  // Only expand a concept if the query explicitly names the property/unit.
  for(const alias of [...concept.aliases].sort((a,b)=>b.length-a.length)){
   const a=clean(alias);
   const pattern=new RegExp('(?<![\\p{L}\\p{N}])'+mt6EscRe(a)+'(?=$|[^\\p{L}\\p{N}])','gu');
   if(pattern.test(text)){
    if(!kinds.includes(concept.k)){kinds.push(concept.k);names.push(concept.name)}
    text=text.replace(pattern,' ');
   }
  }
 }
 return {rest:text,kinds,names};
}
function mt7HasConcept(x,k){
 return (x.mt6Measures||[]).some(m=>m.k===k);
}

function mt6Query(raw){
 const cleaned=clean(raw),measures=mt6FindMeasurements(cleaned,'__QUERY__');
 let rest=cleaned;
 for(const m of [...measures].sort((a,b)=>b.start-a.start))rest=rest.slice(0,m.start)+' '.repeat(m.end-m.start)+rest.slice(m.end);
 // Tolerate redundant bilingual forms: "65 A أمبير" must equal "65 أمبير".
 for(const m of measures){const def=MT6_UNIT_DEFS.find(d=>d.k===m.k);if(def){for(const alias of [...def.alts].sort((a,b)=>b.length-a.length)){
  const pattern=new RegExp('(?<![\\p{L}\\p{N}])'+mt6EscRe(clean(alias))+'(?=$|[^\\p{L}\\p{N}])','gu');
  rest=rest.replace(pattern,' ');
 }}}
 const generic=mt7ReadConcepts(rest);
 rest=generic.rest;
 const functional=MT6_FUNCTIONAL.find(f=>f.r.test(cleaned));
 let parsed=parseQuery(rest);
 if(functional){
  parsed.category=functional.category;
  // Functional understanding already accounts for words like "motor"; don't force a motor part as a text token.
  parsed.tokens=parsed.tokens.filter(t=>!['motor','موتور','محرك','سرعه','سرعة','السرعه','السرعة','تحكم','التحكم','بيتحكم','بتتحكم','تغيير','بيغير','بتغير','كشف','بيكشف','معدن','حديد','metal','لصق','تثبيت','قلاووظ','مسامير'].includes(t));
 }
 if(parsed.category==='sensors')for(const m of measures)if(m.k==='length'&&Number.isInteger(m.value)&&[8,12,18,30].includes(m.value))parsed.size=String(m.value);
 parsed.measures=measures;
 parsed.genericUnits=generic.kinds.filter(k=>!measures.some(m=>m.k===k));
 parsed.intent=[...measures.map(m=>`${m.label}: ${nf.format(m.value)} ${m.unit}`),...parsed.genericUnits.map(k=>'مواصفة: '+MT7_CONCEPTS.find(d=>d.k===k).name)].join(' · ');
 parsed.origin=cleaned;
 return parsed;
}
function mt6MeasurementMatch(x,measure){
 // Sensor M18 denotes thread/diameter, without an explicit "mm" word in inventory descriptions.
 if(measure.k==='length'&&x.kind==='sensors'&&[8,12,18,30].includes(measure.value)&&sensorSize(x.d)===measure.value+' مم')return true;
 return (x.mt6Measures||[]).some(m=>m.k===measure.k&&Math.abs(m.value-measure.value)<=Math.max(.00001,Math.abs(measure.value)*.0005));
}
function mt6Match(x,p){
 if(p.category&&x.kind!==p.category)return false;
 if(p.size&&x.kind==='sensors'&&sensorSize(x.d)!==p.size+' مم')return false;
 if(p.signal&&!sensorSignal(x.d||'').includes(p.signal))return false;
 if(p.con&&!contact(x.d||'').includes(p.con))return false;
 if(!(p.measures||[]).every(m=>mt6MeasurementMatch(x,m)))return false;
 if(!(p.genericUnits||[]).every(k=>mt7HasConcept(x,k)))return false;
 return p.tokens.every(t=>x.text.includes(t)||(t.length>=3&&x.compactCode.includes(compact(t))));
}
function mt6Score(x,p){
 let n=score(x,p)+p.measures.length*150+(p.genericUnits||[]).length*135;
 if(p.measures.some(m=>x.mt6Measures?.some(d=>d.k===m.k&&d.confidence==='explicit'&&Math.abs(d.value-m.value)<=.001)))n+=30;
 if(p.tokens.length===0&&p.measures.length){n+=(x.s===2?5:0)}
 return n;
}
function mt6SetData(arr){
 INDEX=arr.map(x=>({...x,kind:categorize(x),text:clean(x.c+' '+(x.d||'')+' '+(x.i||'')),compactCode:compact(x.c),mt6Measures:mt6FindMeasurements(x.d||'',x.c)}));
}
// External production integration may provide an authenticated adapter:
// window.MainTrackAI = { search: async ({query,signal,localCodes}) => ({codes:[...],confidence:0.7}) }
// The demo deliberately has no real AI provider/key and does not impersonate an AI answer.
let mt6Generation=0,mt6Pending=null;
function mt6Status(message='',type='local'){
 const el=$('mt6Explain'); if(!el)return;el.hidden=!message;el.textContent=message;el.dataset.mode=type;
}
function mt6EligibleAI(p,rows){
 // Never call the cloud for exact item codes or resolved unit queries that have results.
 if(rows.length&&(p.measures?.length||p.genericUnits?.length))return false;
 if(rows.length&&rows[0]._score>=70)return false;
 return true;
}
function mt6EnrichAsync(raw,p,localRows,generation){
 const adapter=window.MainTrackAI?.search;
 if(typeof adapter!=='function'||!navigator.onLine||!mt6EligibleAI(p,localRows))return;
 const controller=new AbortController();mt6Pending=controller;
 mt6Status((p.intent?p.intent+' · ':'')+'جاري محاولة تحسين النتائج…','pending');
 let timer=null;
 const waitLimit=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('search-timeout'))},2800)});
 Promise.race([Promise.resolve().then(()=>adapter({query:raw,signal:controller.signal,localCodes:localRows.slice(0,20).map(r=>r.c)})),waitLimit]).then(answer=>{
  if(generation!==mt6Generation||controller.signal.aborted)return;
  const codes=Array.isArray(answer?.codes)?answer.codes:[],map=new Map(INDEX.map(x=>[x.c,x]));
  const current=new Set(state.base.map(x=>x.c));const extra=[];
  for(const c of codes.slice(0,25)){
   const x=map.get(String(c).toUpperCase());
   if(!x||current.has(x.c)||!(p.measures||[]).every(m=>mt6MeasurementMatch(x,m))||!(p.genericUnits||[]).every(k=>mt7HasConcept(x,k)))continue;
   // Suggestions must remain real Excel records. Do not bypass explicit category, output or contacts.
   if(p.category&&x.kind!==p.category)continue;
   if(p.signal&&!sensorSignal(x.d||'').includes(p.signal))continue;
   if(p.con&&!contact(x.d||'').includes(p.con))continue;
   extra.push({...x,_score:25,_mt6AI:true});current.add(x.c);
  }
  if(extra.length){state.base.push(...extra);renderAll();mt6Status((p.intent?p.intent+' · ':'')+'نتائج إضافية مقترحة؛ تحقق من المواصفات الأصلية.','augmented')}
  else mt6Status(p.intent?'فهم البحث: '+p.intent:'بحث فني محلي','local');
 }).catch(()=>{if(generation===mt6Generation)mt6Status(p.intent?'فهم البحث: '+p.intent:'بحث فني محلي','local')}).finally(()=>{clearTimeout(timer);if(generation===mt6Generation)mt6Pending=null});
}

  let INDEX=[];mt6SetData(DATA);
const state={raw:'',parsed:null,base:[],filtered:[],category:'',facets:{},avail:'all',visible:12,sort:'relevance',foundFacetDefs:[]};
function parseQuery(raw){const q=clean(raw),matches=[];let rest=q;for(const [key,aliases] of Object.entries(ALIASES)){for(const alias of aliases){if(hasPhrase(rest,alias))matches.push({key,alias:clean(alias)})}}
 matches.sort((a,b)=>b.alias.length-a.alias.length);let category=matches.length?matches[0].key:'';
 if(category)for(const m of matches.filter(m=>m.key===category)){rest=rest.replace(m.alias,' ')}
 let size='';if(category==='sensors'){let match=rest.match(/(?:^|[^\d])(?:m\s*)?(\d{1,3})\s*(mm\b|مم|ملم|ملي)/)||rest.match(/\bm\s*(8|12|18|30)\b/);if(match){size=match[1];rest=rest.replace(match[0],' ')}}
 let signal='',con='';if(category==='sensors'){if(/\bpnp\b/.test(rest)){signal='PNP';rest=rest.replace(/\bpnp\b/g,' ')}else if(/\bnpn\b/.test(rest)){signal='NPN';rest=rest.replace(/\bnpn\b/g,' ')}if(/\bnc\b|نورمال\s*كلوز|normally\s*closed/.test(rest)){con='NC';rest=rest.replace(/\bnc\b|نورمال\s*كلوز|normally\s*closed/g,' ')}else if(/\bno\b|نورمال\s*اوبن|normally\s*open/.test(rest)){con='NO';rest=rest.replace(/\bno\b|نورمال\s*اوبن|normally\s*open/g,' ')}}
 for(const [ar,en] of TRANSLATE){rest=rest.replaceAll(clean(ar),' '+en+' ')}
 const tokens=rest.split(/[^\p{L}\p{N}.\/-]+/u).filter(t=>t&&!STOP.has(t));
 return {q,category,size,signal,con,tokens,exactCode:compact(q)};
}
function matches(x,p){if(p.category&&x.kind!==p.category)return false;if(p.size&&!new RegExp('(?:\\bm\\s*'+p.size+'\\b|\\b'+p.size+'\\s*mm\\b|\\bdia(?:meter)?\\.?\\s*:?\\s*'+p.size+'\\b)','i').test(x.text))return false;
 if(p.signal&&!sensorSignal(x.d||'').includes(p.signal))return false;if(p.con&&!contact(x.d||'').includes(p.con))return false;
 return p.tokens.every(t=>x.text.includes(t)||(t.length>=3&&x.compactCode.includes(compact(t))));}
function score(x,p){let n=0;if(p.exactCode&&x.compactCode===p.exactCode)n+=2000;else if(p.exactCode&&x.compactCode.includes(p.exactCode))n+=350;if(p.q&&x.text.includes(p.q))n+=220;for(const t of p.tokens){if(clean(x.c).includes(t))n+=100;if(clean(x.d).includes(t))n+=18;if(hasPhrase(x.d,t))n+=25;}if(p.category&&x.kind===p.category)n+=70;if(x.s===2)n+=4;return n}

function toReferenceItem(x){return {c:x.code,d:x.description||'',q:x.quantity===null||x.quantity===undefined?null:Number(x.quantity),l:x.location||'',n:x.extra?.newCard||null,o:x.extra?.oldCard||null,r:x.extra?.drawer||null,i:x.extra?.iccCode||'',s:x.extra?.sourceSheet==='locations'?1:2};}
self.onmessage=event=>{try{mt6SetData(event.data.map(toReferenceItem));self.postMessage({ok:true,rows:INDEX});}catch{self.postMessage({ok:false});}};
