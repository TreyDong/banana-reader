import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {apiEndpoint,discoverApiModels,normalizeApiBase,testApiService,type AgentSettings} from '../src/agent';

async function mockService(handler:http.RequestListener,prefix='/v1'){
  const server=http.createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');
  const address=server.address() as {port:number};
  return{server,base:`http://127.0.0.1:${address.port}${prefix}`};
}
const settings=(base:string,key='test-key'):AgentSettings=>({provider:'api',codexPath:'',codexModel:'',apiBase:base,apiModel:'',apiKey:key,apiProtocol:'openai'});
const signal=()=>new AbortController().signal;

test('the service test lists models and reports the key that was sent',async()=>{
  const requests:string[]=[];
  const {server,base}=await mockService((req,res)=>{requests.push(req.method+' '+req.url+' '+(req.headers.authorization||'none'));res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({data:[{id:'model-a'},{id:'model-b'}]}));});
  try{
    const report=await testApiService(settings(base),signal());
    assert.equal(report.reason,'ok');assert.equal(report.ok,true);assert.equal(report.models.length,2);assert.equal(report.sentKey,true);
    assert.deepEqual(requests,['GET /v1/models Bearer test-key']);
  }finally{server.closeAllConnections();server.close();}
});

test('a service without a model list still proves the key and address work',async()=>{
  const requests:string[]=[];
  const {server,base}=await mockService((req,res)=>{requests.push(req.method+' '+req.url);if(req.method==='GET'){res.writeHead(404);res.end('no models here');return;}let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'model test not found'}}));});});
  try{
    const report=await testApiService(settings(base),signal());
    assert.equal(report.reason,'chat-only');assert.equal(report.ok,true);assert.equal(report.sentKey,true);assert.equal(report.models.length,0);
    assert.deepEqual(requests,['GET /v1/models','POST /v1/chat/completions']);
  }finally{server.closeAllConnections();server.close();}
});

test('the service test separates a rejected key from a missing key',async()=>{
  const {server,base}=await mockService((req,res)=>{res.writeHead(401);res.end('unauthorized');});
  try{
    const rejected=await testApiService(settings(base),signal());
    assert.equal(rejected.reason,'unauthorized');assert.equal(rejected.sentKey,true);assert.equal(rejected.status,401);
    const missing=await testApiService(settings(base,''),signal());
    assert.equal(missing.reason,'unauthorized');assert.equal(missing.sentKey,false);
  }finally{server.closeAllConnections();server.close();}
});

test('the service test finds a working address when the base is missing the version path',async()=>{
  const {server,base}=await mockService((req,res)=>{if(req.url==='/v1/models'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({data:[{id:'model-a'}]}));return;}res.writeHead(404);res.end('missing');},'');
  try{
    const report=await testApiService(settings(base),signal());
    assert.equal(report.reason,'ok');assert.equal(report.suggestion,base+'/v1');assert.equal(report.models[0].id,'model-a');
  }finally{server.closeAllConnections();server.close();}
});

test('model discovery follows redirects and explains a rejected key',async()=>{
  const {server,base}=await mockService((req,res)=>{if(req.url==='/v1/models'){res.writeHead(302,{Location:'/v1/real-models'});res.end();return;}if(req.url==='/v1/real-models'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({data:[{id:'model-a'}]}));return;}res.writeHead(401);res.end('unauthorized');});
  try{
    const models=await discoverApiModels(settings(base),signal());
    assert.equal(models[0].id,'model-a');
  }finally{server.closeAllConnections();server.close();}
  const denied=await mockService((req,res)=>{res.writeHead(401);res.end('unauthorized');});
  try{await assert.rejects(discoverApiModels(settings(denied.base),signal()),/401/);}finally{denied.server.closeAllConnections();denied.server.close();}
});

test('the service test reports an unreachable address without leaking the key',async()=>{
  const report=await testApiService(settings('http://127.0.0.1:1/v1'),signal());
  assert.equal(report.reason,'network');assert.equal(report.ok,false);
  assert.ok(!JSON.stringify(report).includes('test-key'));
});

test('a duplicated slash in the address never reaches the service',async()=>{
  assert.equal(normalizeApiBase('https://api.ba-nana.com//v1'),'https://api.ba-nana.com/v1');
  assert.equal(normalizeApiBase('https://api.ba-nana.com/v1/'),'https://api.ba-nana.com/v1');
  assert.equal(normalizeApiBase('https://api.ba-nana.com'),'https://api.ba-nana.com');
  assert.equal(apiEndpoint('https://api.ba-nana.com//v1','openai','m').href,'https://api.ba-nana.com/v1/chat/completions');
  const requests:string[]=[];
  const {server}=await mockService((req,res)=>{requests.push(req.url);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({data:[{id:'model-a'}]}));});
  try{
    const models=await discoverApiModels({...settings(`http://127.0.0.1:${(server.address() as {port:number}).port}//v1`),apiBase:`http://127.0.0.1:${(server.address() as {port:number}).port}//v1`},signal());
    assert.equal(models[0].id,'model-a');assert.deepEqual(requests,['/v1/models']);
  }finally{server.closeAllConnections();server.close();}
});

test('a web page instead of an API answer is reported as a wrong address',async()=>{
  const {server,base}=await mockService((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><html><body>Banana Reader</body></html>');});
  try{
    const report=await testApiService(settings(base),signal());
    assert.equal(report.reason,'not-api');assert.equal(report.ok,false);
    await assert.rejects(discoverApiModels(settings(base),signal()),/地址/);
  }finally{server.closeAllConnections();server.close();}
});
