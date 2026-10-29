// Read-only evidence validator. Synthetic inputs never authorize scheduler activation.
export function schedulerProof({job,run,heartbeat,serverNow,expected}){
 const reasons=[];const required='CALL maintrack_qa_permanent.tick()';
 if(!expected||!Number.isInteger(expected.jobId)||expected.jobId<=0)reasons.push('PINNED_JOB_REQUIRED');
 if(job?.jobid!==expected?.jobId||job?.username!=='postgres'||job?.database!=='postgres'||job?.command!==required||job?.schedule!=='* * * * *'||job?.active!==true)reasons.push('JOB_IDENTITY_MISMATCH');
 if(run?.jobid!==job?.jobid||run?.status!=='succeeded'||run?.username!=='postgres'||run?.database!=='postgres'||run?.command!==required)reasons.push('SCHEDULER_RUN_NOT_PROVEN');
 if(!Number.isInteger(run?.job_pid)||run.job_pid<=0||run.job_pid!==heartbeat?.backend_pid||heartbeat?.login!=='postgres'||heartbeat?.database!=='postgres')reasons.push('HEARTBEAT_NOT_FROM_RECORDED_BACKEND');
 const [start,beat,end,now]=[run?.start_time,heartbeat?.heartbeat,run?.end_time,serverNow].map(Date.parse);
 if(![start,beat,end,now].every(Number.isFinite)||!(start<=beat&&beat<=end&&end<=now)||now-beat>90000)reasons.push('STALE_OR_UNCORRELATED_CLOCK');
 return {verified:reasons.length===0,reasons,activationAuthorized:false};
}
