export const profile=Object.freeze({projectRef:'szhstrafzkxzstjdcynl',origin:null,rpId:null,admissionEnabled:false,deployable:false});
export function requireQaBinding(){
 if(!profile.admissionEnabled||!profile.origin||!profile.rpId)throw Error('QA_ADMISSION_DISABLED');
 const origin=new URL(profile.origin);
 if(origin.protocol!=='https:'||origin.origin!==profile.origin||origin.hostname!==profile.rpId||origin.port)throw Error('QA_ORIGIN_RP_MISMATCH');
 return profile;
}
