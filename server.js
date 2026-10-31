// Optional lightweight server. No dependencies required (Node.js 20+).
// Native Jev Decisions API integration. API key stays on the local Node server.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
const root=dirname(fileURLToPath(import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
// Read local .env without introducing a dependency. Never serve this file to browsers.
try{const env=await readFile(join(root,'.env'),'utf8');for(const line of env.split(/\r?\n/)){const match=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);if(match&&!process.env[match[1]])process.env[match[1]]=match[2].replace(/^([\"'])(.*)\1$/,'$2')}}catch{}
const sendJson=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body))};
const port=Number(process.env.PORT||3000);
const jevKey=()=>String(process.env.JEV_API_KEY||'').trim();
const keyConfigured=()=>Boolean(jevKey())&&!['replace_with_your_jev_personal_key','your_api_key','your_key'].includes(jevKey().toLowerCase());
// Keep upstream diagnostics in the local terminal, never print the API key.
const redact=(value)=>String(value||'').replaceAll(jevKey()||'__NO_KEY__','[REDACTED]').slice(0,2000);
const jevEndpoint=process.env.TYPESAFE_API_URL||'https://api.typesafe.ai/v1/systemone';
const modelsEndpoint=process.env.TYPESAFE_MODELS_URL||'https://api.typesafe.ai/v1/models';
const requestedModel=process.env.TYPESAFE_MODEL||'jev-latest';
const strategies=['direct_attack','terrain_destroy','fall_attack'];
const descriptions={direct_attack:'Hit the enemy tank directly to maximize immediate damage.',terrain_destroy:'Destroy terrain around the opponent to create positional disadvantage.',fall_attack:'Remove supporting terrain to make the opponent fall.'};
const makeQuestion=(available)=>({type:'choice',instructions:'Choose the best artillery attack strategy for this turn. Consider wind, health, target distance and available trajectories. Choose only a strategy listed in criteria.',criteria:Object.fromEntries(available.map(k=>[k,descriptions[k]]))});
const makeDecisionRequest=(state,candidates)=>{
  const available=strategies.filter(k=>candidates.some(c=>c.strategy===k));
  return {available,payload:{state:{...state,available_strategies:available,candidate_summary:available.map(k=>{const shots=candidates.filter(c=>c.strategy===k);return {strategy:k,shots:shots.length,max_expected_damage:Math.max(...shots.map(c=>c.enemyDamage)),nearest_landing_distance:Math.min(...shots.map(c=>c.targetDistance))}})},questions:{attack_strategy:makeQuestion(available)}}};
};
const callUpstream=async(url,options={})=>{
  const response=await fetch(url,{...options,headers:{'Accept':'application/json','Authorization':`Bearer ${jevKey()}`,...options.headers},signal:AbortSignal.timeout(15000)});
  const body=await response.text();
  let result;try{result=JSON.parse(body)}catch{}
  if(!response.ok){
    console.error('[TypeSafe] Upstream error',JSON.stringify({status:response.status,endpoint:url,body:redact(body).slice(0,500)}));
    const error=Error(`TypeSafe HTTP ${response.status}: ${redact(result?.detail||result?.message||response.statusText).slice(0,250)}`);
    error.status=response.status;throw error;
  }
  if(!result||typeof result!=='object')throw Error('Invalid TypeSafe JSON response');
  return result;
};
const callJev=async(payload)=>{
  const request={model:requestedModel,...payload};
  const serialized=JSON.stringify(request);
  if(Buffer.byteLength(serialized,'utf8')>32*1024)throw Error('Jev request exceeds 32 KiB');
  const result=await callUpstream(jevEndpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:serialized});
  const answer=result?.answers?.attack_strategy;
  console.info('[TypeSafe] Decision metadata',JSON.stringify({model:result.model,answerKeys:Object.keys(result.answers||{})}));
  if(!answer||typeof answer!=='object')throw Error('Invalid TypeSafe choice response');
  // Some choice responses use `choice`, while others expose the selected criterion as `selected`.
  const choice=typeof answer.choice==='string'?answer.choice:typeof answer.selected==='string'?answer.selected:null;
  if(!choice)throw Error('Invalid TypeSafe choice response: '+redact(JSON.stringify(answer)).slice(0,300));
  return {...answer,choice};
};
const replyError=(res,e)=>{
  const message=e instanceof Error?e.message:'Unknown error';
  console.error('[Jev] Request failed',redact(message));
  const invalid=/^(Invalid |Request too large|Jev request exceeds)/.test(message);
  const timeout=e?.name==='TimeoutError'||e?.name==='AbortError';
  sendJson(res,e?.status|| (invalid?400:timeout?504:502),{error:redact(message)});
};
createServer(async(req,res)=>{
  if(req.method==='GET'&&req.url==='/api/jev/status'){
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify({configured:keyConfigured(),mode:keyConfigured()?'typesafe-direct':'unavailable',endpoint:jevEndpoint,model:requestedModel}));return;
  }
  if(req.method==='GET'&&req.url==='/api/jev/models'){
    if(!keyConfigured()){sendJson(res,503,{error:'JEV_API_KEY is not configured'});return}
    try{const result=await callUpstream(modelsEndpoint);sendJson(res,200,{ok:true,models:result})}catch(e){replyError(res,e)}return;
  }
  if(req.method==='POST'&&req.url==='/api/jev/diagnose'){
    if(!keyConfigured()){sendJson(res,503,{error:'JEV_API_KEY is not configured'});return}
    try{
      const answer=await callJev({state:{wind:4,self_hp:100,enemy_hp:100},questions:{attack_strategy:makeQuestion(strategies)}});
      if(!strategies.includes(answer.choice))throw Error('Invalid Jev choice response');
      sendJson(res,200,{ok:true,provider:'typesafe-jev',strategy:answer.choice,probabilities:answer.probabilities||null,confidence:answer.confidence??null});
    }catch(e){replyError(res,e)}return;
  }
  if(req.method==='POST'&&req.url==='/api/ai/decide'){
    try{
      if(!keyConfigured()){sendJson(res,503,{error:'JEV_API_KEY is not configured'});return}
      let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>24000)throw Error('Request too large')}
      const body=JSON.parse(raw), candidates=body.candidates;
      if(!body.state||typeof body.state!=='object'||Array.isArray(body.state))throw Error('Invalid state');
      if(!Array.isArray(candidates)||candidates.length<1||candidates.length>30||!candidates.every(c=>typeof c.id==='string'&&Number.isFinite(c.angle)&&Number.isFinite(c.power)&&Number.isFinite(c.enemyDamage)&&Number.isFinite(c.targetDistance)&&['direct_attack','terrain_destroy','fall_attack'].includes(c.strategy)))throw Error('Invalid candidates');
      const {available,payload}=makeDecisionRequest(body.state,candidates);
      console.info('[TypeSafe] Request',JSON.stringify({endpoint:jevEndpoint,strategies:available,candidateCount:candidates.length,round:body.state.round,requestBytes:Buffer.byteLength(JSON.stringify(payload))}));
      const answer=await callJev(payload);
      const strategy=answer.choice;
      if(!available.includes(strategy))throw Error('Jev returned an invalid strategy');
      const matching=candidates.filter(c=>c.strategy===strategy);
      const chosen=matching.sort((a,b)=>strategy==='direct_attack'?(b.enemyDamage-a.enemyDamage)||(a.targetDistance-b.targetDistance):strategy==='fall_attack'?(a.targetDistance-b.targetDistance)||(b.enemyDamage-a.enemyDamage):(Math.abs(a.targetDistance-100)-Math.abs(b.targetDistance-100)))[0];
      const probabilities={};const rawProb=answer?.probabilities;
      if(rawProb&&typeof rawProb==='object')for(const k of strategies){const v=rawProb[k];if(typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1)probabilities[k]=v}
      sendJson(res,200,{provider:'typesafe-jev',selectedCandidateId:chosen.id,strategy,probabilities});
    }catch(e){replyError(res,e)}return;
  }
  if(req.method!=='GET'){res.writeHead(405);res.end();return}
  const pathname=new URL(req.url||'/', 'http://localhost').pathname;
  const name=pathname==='/'?'index.html':decodeURIComponent(pathname.slice(1));
  if(!['index.html','style.css','game.js'].includes(name)){res.writeHead(404);res.end();return}
  try{const data=await readFile(join(root,name));res.writeHead(200,{'Content-Type':types[extname(name)],'Cache-Control':'no-cache'});res.end(data)}catch{res.writeHead(404);res.end()}
}).listen(port,()=>console.log(`AI FORTRESS http://localhost:${port}`));
