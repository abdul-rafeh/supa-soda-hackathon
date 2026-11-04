export const patient={resourceType:'Patient',id:'demo-001',active:true,name:[{family:'Rivera',given:['Alex']}]};
export const observation={resourceType:'Observation',id:'obs-001',status:'final',code:{text:'Body temperature'},subject:{reference:'Patient/demo-001'},valueQuantity:{value:37,unit:'°C'}};
export const broken={...observation,id:'obs-002',subject:{reference:'Patient/missing-404'}};
