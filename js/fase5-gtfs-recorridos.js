// Recorridos documentados del productor. No infiere enlaces ni tiempos peatonales.
import {coordinate} from './fase5-modelo.js';
const fail=s=>{throw Error(s);};
const text=v=>typeof v==='string'&&v.trim()&&v.length<=200?v:fail('Identificador de pathways.txt inválido.');
const integer=(v,min,max)=>/^\d+$/.test(String(v))&&Number(v)>=min&&Number(v)<=max?Number(v):fail('Entero de pathways.txt inválido.');
const exact=(o,keys)=>{if(!o||Object.keys(o).sort().join()!==keys)fail('Procedencia de recorrido incompatible.');};
export const PATHWAY_MODES={1:'Pasillo',2:'Escaleras',3:'Pasillo móvil',4:'Escalera mecánica',5:'Ascensor',6:'Puerta de pago',7:'Puerta de salida'};
const station=(stops,s)=>s.kind===4?stops.get(s.parent)?.parent:s.parent;
export function normalizePathways(rows,stops){
 if(rows.length>20000)fail('Máximo 20 000 enlaces de pathways.txt.');
 const index=new Map(),ids=new Set(),boardingParents=new Set([...stops.values()].filter(s=>s.kind===4).map(s=>s.parent));let missingTime=0;
 const add=(from,edge)=>{if(!index.has(from))index.set(from,[]);index.get(from).push(edge);};
 for(const r of rows){
  const id=text(r.pathway_id);if(ids.has(id))fail('pathway_id duplicado.');ids.add(id);
  const a=stops.get(r.from_stop_id),b=stops.get(r.to_stop_id),mode=integer(r.pathway_mode,1,7),bidirectional=integer(r.is_bidirectional,0,1);
  if(!a||!b||a.id===b.id||a.kind===1||b.kind===1||boardingParents.has(a.id)||boardingParents.has(b.id))fail('Extremos de pathways.txt incompatibles.');
  if(!station(stops,a)||station(stops,a)!==station(stops,b))fail('Un recorrido interno requiere extremos de la misma estación.');
  if(mode===7&&bidirectional)fail('Una puerta de salida no puede ser bidireccional.');
  if(r.traversal_time===''||r.traversal_time==null){missingTime++;continue;}
  const seconds=integer(r.traversal_time,1,86400),e={id,fromStopId:a.id,toStopId:b.id,mode,bidirectional,seconds,reversed:false};
  add(a.id,e);if(bidirectional)add(b.id,{...e,reversed:true});
 }
 return {index,total:rows.length,missingTime};
}
const nodeCopy=(s,stops)=>({id:s.id,name:s.name,kind:s.kind,stationId:station(stops,s),coordinates:s.coordinates?structuredClone(s.coordinates):null});
export function pathwayConnections(feed,fromId,tick=()=>{}){
 const {stops,pathways}=feed,origin=stops.get(fromId),result=new Map();if(!origin.parent||!pathways.index.has(fromId))return result;
 const best=new Map([[fromId,0]]),previous=new Map(),pending=new Set([fromId]),settled=new Set();
 while(pending.size){
  let current=null;for(const id of pending){tick();if(current===null||best.get(id)<best.get(current))current=id;}
  pending.delete(current);settled.add(current);if(settled.size>2000)fail('Más de 2000 ubicaciones en el recorrido interno. Reduce el feed.');
  const seconds=best.get(current);
  if(current!==fromId&&stops.get(current).kind===0){
   const nodes=[current],edges=[];let at=current;
   while(at!==fromId){tick();const p=previous.get(at);edges.unshift(structuredClone(p.edge));at=p.from;nodes.unshift(at);if(edges.length>100)fail('Recorrido interno de más de 100 enlaces; no se entregó un cálculo parcial.');}
   result.set(current,{stationId:origin.parent,totalSeconds:seconds,nodes:nodes.map(id=>nodeCopy(stops.get(id),stops)),edges});
   if(result.size>500)fail('Más de 500 plataformas alcanzables por recorridos internos. Reduce el feed.');
  }
  for(const edge of pathways.index.get(current)||[]){tick();const to=edge.reversed?edge.fromStopId:edge.toStopId,cost=seconds+edge.seconds;if(cost>7200||settled.has(to))continue;if(!best.has(to)||cost<best.get(to)){best.set(to,cost);previous.set(to,{from:current,edge});pending.add(to);}}
 }
 return result;
}
export function validatePathway(p,from,to,stationId){
 exact(p,'edges,nodes,stationId,totalSeconds');text(p.stationId);if(p.stationId!==stationId||!Array.isArray(p.nodes)||!Array.isArray(p.edges)||p.edges.length<1||p.edges.length>100||p.nodes.length!==p.edges.length+1)fail('Secuencia de recorrido incompatible.');
 const seen=new Set();let seconds=0;
 for(const n of p.nodes){exact(n,'coordinates,id,kind,name,stationId');text(n.id);if(typeof n.name!=='string'||!n.name.trim()||n.name.length>500||!Number.isInteger(n.kind)||![0,2,3,4].includes(n.kind)||n.stationId!==p.stationId||seen.has(n.id))fail('Ubicación del recorrido inválida.');if(n.coordinates!==null)coordinate(n.coordinates);seen.add(n.id);}
 if(p.nodes[0].id!==from.id||p.nodes.at(-1).id!==to.id||p.nodes[0].kind!==0||p.nodes.at(-1).kind!==0||JSON.stringify(p.nodes[0].coordinates)!==JSON.stringify(from.coordinates)||JSON.stringify(p.nodes.at(-1).coordinates)!==JSON.stringify(to.coordinates))fail('Extremos del recorrido guardado incompatibles.');
 const edgeIDs=new Set();
 for(const [i,e]of p.edges.entries()){
  exact(e,'bidirectional,fromStopId,id,mode,reversed,seconds,toStopId');text(e.id);text(e.fromStopId);text(e.toStopId);
  if(edgeIDs.has(e.id)||!Number.isInteger(e.mode)||e.mode<1||e.mode>7||![0,1].includes(e.bidirectional)||!Number.isInteger(e.seconds)||e.seconds<1||e.seconds>86400||typeof e.reversed!=='boolean'||(e.reversed&&!e.bidirectional)||(e.mode===7&&e.bidirectional))fail('Enlace de recorrido guardado inválido.');edgeIDs.add(e.id);
  if((e.reversed?e.toStopId:e.fromStopId)!==p.nodes[i].id||(e.reversed?e.fromStopId:e.toStopId)!==p.nodes[i+1].id)fail('Recorrido sin continuidad o dirección válida.');seconds+=e.seconds;
 }
 if(!Number.isInteger(p.totalSeconds)||p.totalSeconds!==seconds||seconds>7200)fail('Duración de recorrido inconsistente.');return seconds;
}
