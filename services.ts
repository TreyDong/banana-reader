import {type AgentSettings, type ApiProtocol, API_DEFAULTS, type ModelOption, normalizeModels, mergeModels} from './agent';
export type ServiceKind='codex'|'claude'|'pi'|'api';
export interface ModelService {id:string;name:string;kind:ServiceKind;path:string;protocol:ApiProtocol;base:string;models:ModelOption[]}
export interface ModelRef {serviceId:string;modelId:string}
export interface ModelSetup {services:ModelService[];taskModels:Record<string,ModelRef|null>}
export const SERVICE_NAMES:Record<ServiceKind,string>={codex:'Codex',claude:'Claude',pi:'Pi',api:'自定义 API'};
export const SERVICE_ICONS:Record<ServiceKind,string>={codex:'terminal',claude:'sparkles',pi:'command',api:'globe'};
export function newService(kind:ServiceKind,id:string):ModelService{return{id,name:SERVICE_NAMES[kind],kind,path:'',protocol:'openai',base:API_DEFAULTS.openai,models:[]};}
export function serviceChoices(setup:ModelSetup){return setup.services.flatMap(service=>service.models.map(model=>({...model,serviceId:service.id,serviceName:service.name,kind:service.kind})));}
export function validRef(setup:ModelSetup,ref:ModelRef|null|undefined):ref is ModelRef{return !!ref&&setup.services.some(s=>s.id===ref.serviceId&&s.models.some(m=>m.id===ref.modelId));}
export function resolveModel(setup:ModelSetup,task='default',override?:ModelRef):{service:ModelService;model:ModelOption}{
  const ref=override||setup.taskModels[task]||setup.taskModels.default;
  if(!ref)throw new Error('请先在设置中分配默认问答模型。');
  const service=setup.services.find(s=>s.id===ref.serviceId),model=service?.models.find(m=>m.id===ref.modelId);
  if(!service||!model)throw new Error('所选模型已移除，请重新分配模型。');return{service,model};
}
export function serviceSettings(service:ModelService,modelId='',key=''):AgentSettings{
  return{provider:service.kind,serviceId:service.id,serviceName:service.name,codexPath:service.path,codexModel:modelId,claudePath:service.path,claudeModel:modelId,piPath:service.path,piModel:modelId,apiProtocol:service.protocol,apiBase:service.base,apiModel:modelId,apiKey:key};
}
export function pruneAssignments(setup:ModelSetup){for(const [task,ref]of Object.entries(setup.taskModels))if(ref&&!validRef(setup,ref))delete setup.taskModels[task];}
export function migrateSetup(legacy:AgentSettings&{services?:ModelService[];taskModels?:Record<string,ModelRef|null>;modelLists?:Record<string,ModelOption[]>;apiProfiles?:Record<string,{base:string;model:string}>}):ModelSetup{
  if(Array.isArray(legacy.services)){
    const seen=new Set<string>();const services=legacy.services.filter(s=>s&&typeof s.id==='string'&&/^[a-z0-9-]+$/.test(s.id)&&!seen.has(s.id)&&!!SERVICE_NAMES[s.kind]&&(seen.add(s.id),true)).map(s=>({...s,name:s.name?.trim().slice(0,80)||SERVICE_NAMES[s.kind],path:s.path||'',protocol:API_DEFAULTS[s.protocol]?s.protocol:'openai' as ApiProtocol,base:s.base||API_DEFAULTS.openai,models:normalizeModels(s.models)}));
    return{services,taskModels:{...(legacy.taskModels||{})}};
  }
  const services:ModelService[]=[];
  for(const kind of ['codex','claude']as const){const selected=kind==='codex'?legacy.codexModel:legacy.claudeModel;const models=mergeModels(normalizeModels(legacy.modelLists?.[kind]),selected?[{id:selected,name:selected}]:[]);if(!models.length)continue;services.push({...newService(kind,'legacy-'+kind),path:kind==='codex'?legacy.codexPath:legacy.claudePath||'',models});}
  const protocols=new Set<ApiProtocol>([legacy.apiProtocol||'openai',...Object.keys(legacy.apiProfiles||{})as ApiProtocol[],...Object.keys(legacy.modelLists||{}).filter(k=>k.startsWith('api:')).map(k=>k.slice(4)as ApiProtocol)]);
  for(const protocol of protocols){if(!API_DEFAULTS[protocol])continue;const current=protocol===(legacy.apiProtocol||'openai'),profile=legacy.apiProfiles?.[protocol],id=current?legacy.apiModel:profile?.model||'',models=mergeModels(normalizeModels(legacy.modelLists?.['api:'+protocol]),id?[{id,name:id}]:[]);if(!models.length&&!(current&&legacy.provider==='api'))continue;services.push({...newService('api','legacy-api-'+protocol),name:'API · '+({openai:'OpenAI',responses:'Responses',anthropic:'Anthropic',gemini:'Gemini'}[protocol]),protocol,base:(current?legacy.apiBase:profile?.base)||API_DEFAULTS[protocol],models});}
  const selectedId=legacy.provider==='codex'?legacy.codexModel:legacy.provider==='claude'?legacy.claudeModel:legacy.apiModel;
  const selected=services.find(s=>s.kind===legacy.provider&&(s.kind!=='api'||s.protocol===(legacy.apiProtocol||'openai'))&&s.models.some(m=>m.id===selectedId));
  return{services,taskModels:{default:selected&&selectedId?{serviceId:selected.id,modelId:selectedId}:null}};
}
