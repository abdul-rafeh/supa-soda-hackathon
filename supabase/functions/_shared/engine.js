const statuses=['registered','preliminary','final','amended','corrected','cancelled','entered-in-error','unknown'];
export function evaluate(raw,events){
 let resource; const issues=[];
 const issue=(stage,path,message)=>issues.push({stage,path,message});
 try{resource=JSON.parse(raw)}catch{issue('structure','$','Payload must be valid JSON.')}
 const type=resource?.resourceType,id=resource?.id;
 if(!issues.length){
 if(!['Patient','Observation'].includes(type))issue('structure','resourceType','This gateway supports Patient and Observation resources.');
 if(id!==undefined && (typeof id!=='string'||! /^[A-Za-z0-9.-]{1,64}$/.test(id)))issue('structure','id','Use a FHIR id of 1–64 letters, digits, periods or hyphens.');
 if(type==='Patient' && resource.active!==undefined && typeof resource.active!=='boolean')issue('structure','active','Expected a boolean.');
 if(type==='Observation'){
 const values=Object.keys(resource).filter(k=>/^value[A-Z]/.test(k));
 if(values.length>1)issue('structure','value[x]','Observation may supply only one value[x] field.');
 if(!statuses.includes(resource.status))issue('structure','status','Expected an R4 Observation status.');
 const code=resource.code;
 if(!code || typeof code!=='object'||Array.isArray(code)||(!code.text&&!code.coding?.length))issue('structure','code','Supply an observation code with text or coding.');
 }}
 const structure=issues.length?'failed':'passed';
 if(structure==='passed'){
 if(!id)issue('integrity','id','Local ingestion requires a resource id.');
 if(type==='Observation'){
 const ref=resource.subject?.reference;
 if(typeof ref!=='string'||!events.some(e=>e.outcome==='accepted'&&e.type==='Patient'&&ref==='Patient/'+e.resourceId))issue('integrity','subject.reference',(typeof ref==='string'?ref:'Patient reference')+' does not resolve to an accepted local Patient.');
 }}
 return {eventId:crypto.randomUUID(),time:new Date().toISOString(),raw,type:typeof type==='string'?type:'Unknown',resourceId:typeof id==='string'?id:'—',structure,integrity:structure==='failed'?'skipped':issues.length?'failed':'passed',outcome:issues.length?'quarantined':'accepted',issues};
}
