export {permanentChannel as createQaChannel} from './permanent-adapter.mjs';
export const BUCKET='maintrack-security-qa-20261025';
export function guardStorageRequest(){throw Error('QA_STORAGE_OPERATIONS_DISABLED');}
