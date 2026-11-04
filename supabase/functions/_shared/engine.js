import { structureIssues } from './structure.js';
export function evaluate(raw,events){
 let resource; const issues=[];
 const issue=(stage,path,message)=>issues.push({stage,path,message});
 try{resource=JSON.parse(raw)}catch{issue('structure','$','Payload must be valid JSON.')}
 const type=resource?.resourceType,id=resource?.id;
 if(!issues.length) issues.push(...structureIssues(resource));
 const structure=issues.length?'failed':'passed';
 if(structure==='passed'){
 if(!id)issue('integrity','id','Local ingestion requires a resource id.');
 if(type==='Observation'){
 const ref=resource.subject?.reference;
 if(typeof ref!=='string'||!events.some(e=>e.outcome==='accepted'&&e.type==='Patient'&&ref==='Patient/'+e.resourceId))issue('integrity','subject.reference',(typeof ref==='string'?ref:'Patient reference')+' does not resolve to an accepted local Patient.');
 }}
 return {eventId:crypto.randomUUID(),time:new Date().toISOString(),raw,type:typeof type==='string'?type:'Unknown',resourceId:typeof id==='string'?id:'—',structure,integrity:structure==='failed'?'skipped':issues.length?'failed':'passed',outcome:issues.length?'quarantined':'accepted',issues};
}
