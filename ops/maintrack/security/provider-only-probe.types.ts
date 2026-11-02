// Static import/call contract only; deno check does not execute this fixture.
import {createProviderOnlyProbe} from './provider-only-probe.mjs';
import {createQaSiteverifyVerifier} from './provider-only-siteverify.mjs';
createProviderOnlyProbe({
 projectRef:'szhstrafzkxzstjdcynl',operatorKey:'synthetic-operator-contract-only',
 bodySha256:'0'.repeat(64),expires:0,
 verify:createQaSiteverifyVerifier({secret:'synthetic-provider-secret-for-types-only',fetchImpl:async()=>Response.json({success:false})}),
});
