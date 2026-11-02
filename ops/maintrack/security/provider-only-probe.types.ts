// Static import/call contract only; deno check does not execute this fixture.
import {createProviderOnlyProbe} from './provider-only-probe.mjs';
createProviderOnlyProbe({
 projectRef:'szhstrafzkxzstjdcynl',operatorKey:'synthetic-operator-contract-only',
 bodySha256:'0'.repeat(64),expires:0,verify:async()=>true,
});
