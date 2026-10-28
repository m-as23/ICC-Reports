/**
 * MainTrack account v2 hour arithmetic.
 * Calendar days worked and earned 8-hour-equivalent days are distinct metrics.
 * Minutes remain integers; presentation never controls ledger precision.
 */
export const SHIFT_END = Object.freeze({1:{hour:15,nextDay:0},2:{hour:23,nextDay:0},3:{hour:7,nextDay:1}});
export function formatLocalDateTime(value){
  const d=new Date(value);
  if(!Number.isFinite(d.getTime()))throw new Error('INVALID_DATETIME');
  const pad=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
}
export function getShiftEnd(date,shift){
  const rule=SHIFT_END[shift];
  if(!rule||typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('INVALID_SHIFT');
  const d=new Date(date+'T00:00:00');
  if(!Number.isFinite(d.getTime())||formatLocalDateTime(d).slice(0,10)!==date)throw new Error('INVALID_DATE');
  d.setDate(d.getDate()+rule.nextDay);
  d.setHours(rule.hour,0,0,0);
  return formatLocalDateTime(d);
}
export function calculateOvertime({mode,date,shift,start,end}){
  const a=new Date(start),b=new Date(end),ms=b.getTime()-a.getTime();
  if(!Number.isFinite(ms)||!Number.isFinite(a.getTime())||!Number.isFinite(b.getTime()))throw new Error('INVALID_DATETIME');
  if(ms<=0||ms>24*60*60000||ms%60000!==0)throw new Error('INVALID_OVERTIME_RANGE');
  if(mode==='extension'){
    const endOfShift=new Date(getShiftEnd(date,shift)).getTime();
    if(a.getTime()<endOfShift)throw new Error('BEFORE_SHIFT_END');
  }else if(mode!=='separate')throw new Error('INVALID_MODE');
  const minutes=ms/60000;
  return {minutes,hours:minutes/60,equivalentDays:minutes/480};
}
export function formatQuantity(n,maximumFractionDigits=4){
  return new Intl.NumberFormat('ar-EG-u-nu-latn',{maximumFractionDigits}).format(n);
}
