const W=960,H=500,GROUND=470,GRAVITY=480,DT=1/120,MAX_TURNS=10;
const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d');
let state,raf,last=0;
let playerTypes={player:"human",ai:"physics"},gameStarted=false,jevConfigured=false;
const actorName=a=>a==="player"?"1P":"2P";
const actorType=a=>playerTypes[a];
const typeLabel=t=>({human:'사용자',physics:'Physics Bot',jev:'Jev AI'})[t]||t;
const currentActor=()=>state?.currentActor;
const isHumanTurn=()=>gameStarted&&state?.phase==="player"&&actorType(currentActor())==="human";
const MIN_POWER=0,MAX_POWER=100,CHARGE_MS=1600,ANGLE_STEP=3;
let charging=false,chargeStart=0,chargedPower=0,lastPlayerPower=null;let lastPowerByActor={player:null,ai:null};
// The bar retains the last fired power until the next Space press.
function resetCharge(){charging=false;chargedPower=0;}
function beginCharge(){if(!state||!isHumanTurn()||charging)return;charging=true;chargeStart=performance.now();chargedPower=0;update()}
function releaseCharge(){if(!charging)return;updateCharge(performance.now());const power=chargedPower;charging=false;if(isHumanTurn()){lastPlayerPower=power;lastPowerByActor[currentActor()]=power;fire(currentActor(),Number($('angle').value),power)}else update()}
function updateCharge(now){if(!charging||!isHumanTurn())return;const steps=Math.floor((now-chargeStart)/CHARGE_MS*(MAX_POWER-MIN_POWER));chargedPower=Math.min(MAX_POWER,MIN_POWER+steps);$('powerValue').textContent=chargedPower+'%';$('powerFill').style.width=chargedPower+'%';$('powerMeter').setAttribute('aria-valuenow',String(chargedPower))}
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function rng(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296}}
function terrain(seed){const r=rng(seed),a=25+r()*30,b=12+r()*28,c=8+r()*14,p=r()*6.28,q=r()*6.28;const h=Array.from({length:W},(_,x)=>clamp(330+a*Math.sin(x/125+p)+b*Math.sin(x/65+q)+c*Math.sin(x/34),245,415));for(const sx of [110,850]){const flat=h[sx];for(let x=sx-36;x<=sx+36;x++){const t=clamp((Math.abs(x-sx)-21)/15,0,1);h[x]=flat*(1-t)+h[x]*t}}return h}
function groundAt(x){return state.heights[clamp(Math.round(x),0,W-1)]}
function tankY(t){return groundAt(t.x)-12}
// Estimate the local ground tangent under the tank's tracks.
// Positive screen Y points downward, so uphill to the right gives a negative angle.
function tankSlope(t){
 const halfTrack=17;
 const left=groundAt(t.x-halfTrack),right=groundAt(t.x+halfTrack);
 return clamp(Math.atan2(right-left,halfTrack*2),-Math.PI/5,Math.PI/5);
}
function turretPivot(t){
 const a=tankSlope(t),c=Math.cos(a),s=Math.sin(a);
 return {x:t.x+14*s,y:tankY(t)-14*c};
}
function log(msg){}
function newGame(){const seed=Math.floor(Math.random()*2**32);state={seed,heights:terrain(seed),player:{x:110,hp:100},ai:{x:850,hp:100},wind:0,phase:'player',currentActor:'player',round:1,shots:0,score:0,direct:0,projectile:null,explosion:null,damageEffects:[],matchId:crypto.randomUUID?.()||String(Date.now()),turnId:0,token:(state?.token||0)+1,aiProvider:'local',winner:null};$('overlay').classList.add('hidden');$('log').replaceChildren();lastPlayerPower=null;lastPowerByActor={player:null,ai:null};resetCharge();resetDecisionPanel();$('angle').value=45;nextWind();log(`새 게임 시작 · 지형 시드 ${seed}`);update();render();scheduleBot()}
function nextWind(){state.wind=Math.floor(Math.random()*21)-10}
function movePlayer(delta){
  if(!isHumanTurn())return;
  // Keep the tank on the map and prevent it from overlapping the opponent.
  const minX=25,maxX=W-25;
  const actor=currentActor(),t=state[actor],other=state[actor==='player'?'ai':'player'];
  const next=clamp(t.x+delta,25,W-25);if(Math.abs(next-other.x)>=45)t.x=next;
}

function update(){if(!state)return;const a=state.currentActor;const human=isHumanTurn();$('php').textContent=state.player.hp;$('ahp').textContent=state.ai.hp;$('pbar').style.width=state.player.hp+'%';$('abar').style.width=state.ai.hp+'%';$('p1hpMeter').setAttribute('aria-valuenow',String(state.player.hp));$('p2hpMeter').setAttribute('aria-valuenow',String(state.ai.hp));$('pbar').classList.toggle('hp-critical',state.player.hp<=25);$('abar').classList.toggle('hp-critical',state.ai.hp<=25);$('p1name').textContent='1P '+typeLabel(playerTypes.player);$('p2name').textContent='2P '+typeLabel(playerTypes.ai);$('turn').textContent=state.phase==='player'?`${actorName(a)} ${human?'사용자 턴':actorType(a)==='jev'?'Jev 판단 중...':'Physics Bot 계산 중...'}`:({flight:'포탄 비행 중',resolve:'폭발!',over:'게임 종료'})[state.phase];$('round').textContent=`ROUND ${state.round}/${MAX_TURNS}`;$('powerValue').textContent=chargedPower+'%';$('powerFill').style.width=chargedPower+'%';$('powerMeter').setAttribute('aria-valuenow',String(chargedPower));$('p1hud').classList.toggle('active-turn',gameStarted&&state.phase==='player'&&a==='player');$('p2hud').classList.toggle('active-turn',gameStarted&&state.phase==='player'&&a==='ai');document.querySelectorAll('#touchControls button').forEach(button=>button.disabled=!human);$('angle').disabled=!human;$('powerMeter').setAttribute('aria-disabled',String(!human));$('powerValue').closest('.controls').classList.toggle('is-inactive',!human);$('touchControls').classList.toggle('is-inactive',!human)}
function scheduleBot(){if(!gameStarted||state.phase!=='player'||!['physics','jev'].includes(actorType(currentActor())))return;const token=state.token,actor=currentActor();setTimeout(()=>{if(token===state.token&&state.phase==='player'&&currentActor()===actor)(actorType(actor)==='jev'?jevTurn(token,actor):botTurn(token,actor))},450)}

function origin(t,angle,direction){
 const r=angle*Math.PI/180,p=turretPivot(t);
 return {x:p.x+direction*Math.cos(r)*31,y:p.y-Math.sin(r)*31};
}
function point(shot,t){const r=shot.angle*Math.PI/180,v=shot.power*8;return{x:shot.x+shot.dir*v*Math.cos(r)*t+state.wind*6*t*t,y:shot.y-v*Math.sin(r)*t+.5*GRAVITY*t*t}}
function collide(p){if(p.x<0||p.x>=W||p.y>H+80)return {x:clamp(p.x,0,W-1),y:clamp(p.y,0,H),kind:'miss'};for(const [name,t] of [['player',state.player],['ai',state.ai]]){if(Math.abs(p.x-t.x)<17&&Math.abs(p.y-(tankY(t)-7))<15)return{x:p.x,y:p.y,kind:'tank',target:name}}if(p.y>=groundAt(p.x))return{x:p.x,y:groundAt(p.x),kind:'ground'};return null}
function simulate(shot){let prev={x:shot.x,y:shot.y};for(let i=1;i<1400;i++){const t=i*DT,p=point(shot,t);const steps=4;for(let j=1;j<=steps;j++){const f=j/steps,s={x:prev.x+(p.x-prev.x)*f,y:prev.y+(p.y-prev.y)*f};const hit=collide(s);if(hit)return hit}prev=p}return{x:prev.x,y:prev.y,kind:'miss'}}
function crater(x,y,radius){const from=clamp(Math.floor(x-radius),0,W-1),to=clamp(Math.ceil(x+radius),0,W-1);for(let i=from;i<=to;i++){const dx=i-x,depth=Math.sqrt(Math.max(0,radius*radius-dx*dx));const surface=y+depth;state.heights[i]=Math.min(GROUND,Math.max(state.heights[i],surface))}}
function damageAt(x,y,target){const d=Math.hypot(target.x-x,(tankY(target)-7)-y);return Math.round(40*Math.max(0,1-d/56))}
function finishShot(hit,actor){state.phase='resolve';const beforeY={player:tankY(state.player),ai:tankY(state.ai)};// Every on-map impact deforms the ground. A tank hit occurs above the
// surface, so anchor the crater to the ground beneath the impact instead
// of the projectile's airborne collision point.
if(hit.kind!=='miss'){
 const terrainY=groundAt(hit.x);
 const craterY=hit.kind==='tank'?terrainY:hit.y;
 crater(hit.x,craterY,hit.kind==='tank'?38:32);
}
const damages={};for(const name of ['player','ai']){const t=state[name];let damage=hit.kind==='miss'?0:damageAt(hit.x,hit.y,t);if(hit.target===name)damage=Math.max(damage,32);const oldY=beforeY[name];const newY=tankY(t);const fall=Math.max(0,newY-oldY);if(fall>45)damage+=Math.min(20,Math.floor((fall-45)/3));t.hp=clamp(t.hp-damage,0,100);damages[name]=damage}if(actor==='player'){state.score+=damages.ai*10;if(hit.target==='ai'){state.score+=100;state.direct++}}log(`${actorName(actor)} 발사: 상대 ${damages[actor==='player'?'ai':'player']} 피해 · ${hit.kind==='miss'?'맵 밖':hit.kind==='tank'?'직격':'지형 충돌'}`);state.explosion={x:hit.x,y:hit.y,until:performance.now()+420};for(const name of ['player','ai']){if(damages[name]>0){state.damageEffects.push({name,damage:damages[name],started:performance.now(),until:performance.now()+1100});}}state.projectile=null;update();const token=state.token;setTimeout(()=>{if(token!==state.token)return;if(state.player.hp<=0||state.ai.hp<=0||state.round>=MAX_TURNS&&actor==='ai'){endGame();return}if(actor==='player'){state.currentActor='ai'}else{state.round++;state.currentActor='player'}state.phase='player';nextWind();chargedPower=lastPowerByActor[state.currentActor]??0;update();scheduleBot()},500)}
function fire(actor,angle,power){if(!['player','ai'].includes(actor))return;lastPowerByActor[actor]=power;const t=state[actor],dir=actor==='player'?1:-1,o=origin(t,angle,dir);state.lastAngles??={};state.lastAngles[actor]=angle;state.projectile={...o,dir,angle,power,t:0,actor,prev:o};state.phase='flight';state.shots++;update()}
function candidates(actor){const enemy=actor==='player'?'ai':'player',dir=actor==='player'?1:-1,arr=[];for(let angle=12;angle<=80;angle+=4){for(let power=24;power<=100;power+=4){const o=origin(state[actor],angle,dir),hit=simulate({...o,angle,power,dir});const enemyDamage=hit.kind==='miss'?0:Math.max(damageAt(hit.x,hit.y,state[enemy]),hit.target===enemy?32:0);const selfDamage=hit.kind==='miss'?0:Math.max(damageAt(hit.x,hit.y,state[actor]),hit.target===actor?32:0);const distance=Math.abs(hit.x-state[enemy].x);const score=enemyDamage*10-selfDamage*15-Math.min(distance,500)*.12;arr.push({id:`a${angle}p${power}`,angle,power,enemyDamage,selfDamage,landingX:Math.round(hit.x),targetDistance:Math.round(distance),score})}}arr.sort((a,b)=>b.score-a.score);return arr.slice(0,5)}
async function botTurn(token,actor){const list=candidates(actor),choice=list[0];if(token!==state.token||state.phase!=='player'||state.currentActor!==actor)return;log(`${actorName(actor)} Physics Bot: 각도 ${choice.angle}°, 파워 ${choice.power}%`);await new Promise(r=>setTimeout(r,500));if(token===state.token&&state.phase==='player'&&state.currentActor===actor)fire(actor,choice.angle,choice.power)}

function resetDecisionPanel(){
 $('decisionPanel').classList.toggle('hidden',!Object.values(playerTypes).includes('jev'));
 $('jevStatus').textContent=jevConfigured?'연결 설정됨':'연결 대기';
 $('decisionContext').textContent='Jev가 판단할 때 현재 상황을 표시합니다.';
 $('decisionResult').textContent='실제 Jev 판단 결과를 기다리는 중입니다.';
 for(const el of document.querySelectorAll('[data-strategy]')){el.classList.remove('chosen');el.querySelector('.probability').textContent='—'}
}
function classifyCandidate(c,actor){
 const target=state[actor==='player'?'ai':'player'];
 if(c.enemyDamage>=12)return 'direct_attack';
 if(Math.abs(c.landingX-target.x)<48)return 'fall_attack';
 return 'terrain_destroy';
}
function jevCandidates(actor){
 const base=candidates(actor);const enemy=actor==='player'?'ai':'player';const dir=actor==='player'?1:-1;
 const extra=[];
 for(let angle=20;angle<=80;angle+=12)for(let power=36;power<=96;power+=12){
  const o=origin(state[actor],angle,dir),hit=simulate({...o,angle,power,dir});
  const targetDistance=Math.round(Math.abs(hit.x-state[enemy].x));
  const enemyDamage=hit.kind==='miss'?0:Math.max(damageAt(hit.x,hit.y,state[enemy]),hit.target===enemy?32:0);
  extra.push({id:`a${angle}p${power}`,angle,power,enemyDamage,selfDamage:0,landingX:Math.round(hit.x),targetDistance});
 }
 const combined=new Map([...base,...extra].map(c=>[c.id,{...c,strategy:classifyCandidate(c,actor)}]));
 const list=[...combined.values()];const chosen=[];
 for(const strategy of ['direct_attack','terrain_destroy','fall_attack'])chosen.push(...list.filter(c=>c.strategy===strategy).sort((a,b)=>strategy==='direct_attack'?b.enemyDamage-a.enemyDamage:strategy==='fall_attack'?a.targetDistance-b.targetDistance:Math.abs(a.targetDistance-100)-Math.abs(b.targetDistance-100)).slice(0,4));
 return [...new Map(chosen.map(c=>[c.id,c])).values()].slice(0,12);
}
async function jevTurn(token,actor){
 if(!jevConfigured)return;
 const list=jevCandidates(actor);
 $('decisionPanel').classList.remove('hidden');$('jevStatus').textContent='판단 요청 중';
 $('decisionContext').textContent=`${actorName(actor)} · 바람 ${state.wind} · 내 HP ${state[actor].hp} · 상대 HP ${state[actor==='player'?'ai':'player'].hp} · 후보 ${list.length}개`;
 $('decisionResult').textContent='Jev API 응답을 기다리는 중...';
 try{
  const response=await fetch('/api/ai/decide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:{wind:state.wind,round:state.round,selfHp:state[actor].hp,enemyHp:state[actor==='player'?'ai':'player'].hp,selfX:state[actor].x,enemyX:state[actor==='player'?'ai':'player'].x,terrainSamples:state.heights.filter((_,i)=>i%16===0).map(Math.round)},candidates:list})});
  const result=await response.json();if(!response.ok)throw Error(result.error||`HTTP ${response.status}`);
  if(token!==state.token||state.phase!=='player'||state.currentActor!==actor)return;
  if(result.provider!=='jev')throw Error('Jev 제공자 검증 실패');
  const chosen=list.find(c=>c.id===result.selectedCandidateId);if(!chosen||chosen.strategy!==result.strategy)throw Error('잘못된 Jev 선택');
  $('jevStatus').textContent='판단 완료';
  for(const el of document.querySelectorAll('[data-strategy]')){const k=el.dataset.strategy;el.classList.toggle('chosen',k===result.strategy);const p=result.probabilities?.[k];el.querySelector('.probability').textContent=typeof p==='number'?`${(p*100).toFixed(1)}%`:'확률 미제공'}
  $('decisionResult').textContent=`선택: ${{direct_attack:'A. 직접 공격',terrain_destroy:'B. 지형 파괴',fall_attack:'C. 낙하 유도'}[result.strategy]} · 각도 ${chosen.angle}° · 파워 ${chosen.power}%`;
  log(`${actorName(actor)} Jev: ${$('decisionResult').textContent}`);
  await new Promise(r=>setTimeout(r,1100));if(token===state.token&&state.phase==='player'&&state.currentActor===actor)fire(actor,chosen.angle,chosen.power);
 }catch(error){if(token!==state.token)return;$('jevStatus').textContent='판단 실패';$('decisionResult').textContent=`Jev 응답 실패: ${error.message}. 다른 AI로 대체하지 않습니다.`;log('Jev 오류: '+error.message);state.phase='jev-error';update()}
}
function endGame(){state.phase='over';state.winner=state.ai.hp===state.player.hp?'draw':state.ai.hp<state.player.hp?'player':'ai';if(state.winner==='player')state.score+=1000+state.player.hp*5+Math.max(0,MAX_TURNS-state.round)*50;else if(state.winner==='draw')state.score+=300;$('resultTitle').textContent=state.winner==='player'?'🏆 1P 승리!':state.winner==='ai'?'🏆 2P 승리!':'🤝 무승부';$('resultInfo').textContent=`점수 ${state.score.toLocaleString()} · ${state.round}라운드 · 지형 시드 ${state.seed}`;$('overlay').classList.remove('hidden');update()}
function drawActiveTurn(t,name,now){
 if(!gameStarted||state.phase!=='player'||state.currentActor!==name)return;
 const y=tankY(t),pulse=(Math.sin(now*.005)+1)/2;
 ctx.save();
 ctx.strokeStyle=name==='player'?`rgba(45,129,242,${.5+pulse*.4})`:`rgba(236,89,76,${.5+pulse*.4})`;
 ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(t.x,y+1,27+pulse*5,9+pulse*2,0,0,Math.PI*2);ctx.stroke();
 const label=actorType(name)==='human'?'YOUR TURN':actorType(name)==='jev'?'JEV TURN':'BOT TURN';
 const ly=Math.max(42,y-88);
 ctx.fillStyle=name==='player'?'#246cbb':'#bc504b';
 ctx.beginPath();ctx.roundRect(t.x-47,ly-19,94,25,7);ctx.fill();
 ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 12px system-ui,sans-serif';ctx.fillText(label,t.x,ly-6);
 ctx.fillStyle=name==='player'?'#246cbb':'#bc504b';ctx.beginPath();ctx.moveTo(t.x-6,ly+6);ctx.lineTo(t.x+6,ly+6);ctx.lineTo(t.x,ly+14);ctx.closePath();ctx.fill();
 ctx.restore();
}
function drawTank(t,color,dir,angle,name,now){
 const y=tankY(t),effect=state.damageEffects.find(e=>e.name===name&&now<e.until);
 const elapsed=effect?now-effect.started:0;
 const shake=effect&&elapsed<350?Math.sin(elapsed*.11)*Math.max(0,1-elapsed/350)*5:0;
 ctx.save();ctx.translate(t.x+shake,y);
 // Enlarge only the tank artwork on small screens; physics/hitboxes stay unchanged.
 const mobileTankScale=window.matchMedia('(max-width: 650px)').matches?1.65:1;
 ctx.scale(mobileTankScale,mobileTankScale);
 if(effect&&Math.floor(elapsed/85)%2===0){ctx.shadowColor='#ff3b30';ctx.shadowBlur=22;}
 // The chassis follows the tangent of the terrain, while the barrel keeps
 // its absolute aiming angle. This matches the projectile's launch direction.
 const slope=tankSlope(t);
 ctx.rotate(slope);
 ctx.fillStyle='#27374a';ctx.fillRect(-21,-6,42,12);
 ctx.fillStyle=effect&&Math.floor(elapsed/100)%2===0?'#fff0b4':color;ctx.fillRect(-16,-18,32,17);
 ctx.rotate(-slope);
 const pivotX=14*Math.sin(slope),pivotY=-14*Math.cos(slope);
 ctx.strokeStyle='#1f3549';ctx.lineWidth=9;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(pivotX,pivotY);
 ctx.lineTo(pivotX+dir*Math.cos(angle*Math.PI/180)*31,pivotY-Math.sin(angle*Math.PI/180)*31);
 ctx.stroke();ctx.restore();
 if(effect){
  const progress=Math.min(1,elapsed/900);
  ctx.save();ctx.globalAlpha=Math.max(0,1-progress);ctx.textAlign='center';ctx.font='bold 27px sans-serif';ctx.lineWidth=4;ctx.strokeStyle='#4a1717';ctx.fillStyle='#ff5757';
  const text='-'+effect.damage;const textY=y-56-progress*42;ctx.strokeText(text,t.x,textY);ctx.fillText(text,t.x,textY);ctx.restore();
 }
}
function drawWind(now){
 const wind=state.wind;
 const magnitude=Math.abs(wind);
 const direction=Math.sign(wind);
 ctx.save();
 // A dark translucent badge keeps the direction and strength readable over bright sky.
 const label=wind===0?'●  무풍':`${direction>0?'➜':'⬅'}  바람 ${magnitude}`;
 ctx.font='bold 21px system-ui, sans-serif';
 ctx.textAlign='center';ctx.textBaseline='middle';
 const badgeWidth=Math.max(134,ctx.measureText(label).width+32);
 const bx=(W-badgeWidth)/2;
 ctx.fillStyle='rgba(105,115,125,.72)';
 ctx.beginPath();ctx.roundRect(bx,15,badgeWidth,44,13);ctx.fill();
 ctx.fillStyle=wind===0?'#dbe8f7':'#ffffff';
 ctx.fillText(label,W/2,37);
 // Four airy, single-stroke wind curls; no double strokes, arrows or shadows.
 // Their drift direction and speed follow the actual wind without changing physics.
 const curls=[
  {x:82,y:113,length:89,scale:1.00},
  {x:370,y:183,length:113,scale:1.14},
  {x:675,y:112,length:97,scale:.92},
  {x:850,y:268,length:105,scale:1.06}
 ];
 const driftSpeed=magnitude===0?0:16+magnitude*8;
 ctx.strokeStyle='rgba(255,255,255,0.75)';
 ctx.lineWidth=2.8;
 ctx.lineCap='round';
 ctx.lineJoin='round';
 for(const [i,curl] of curls.entries()){
  const travel=now*.001*driftSpeed;
  const offset=direction===0?0:direction*travel;
  const x=((curl.x+offset+160)%(W+320)+(W+320))%(W+320)-160;
  const y=curl.y;
  const len=curl.length;
  // Mirror the curling tail when wind blows left.
  ctx.save();
  ctx.translate(x,y);
  if(direction<0)ctx.scale(-1,1);
  ctx.scale(curl.scale,curl.scale);
  ctx.beginPath();
  ctx.moveTo(-len*.52,0);
  ctx.bezierCurveTo(-len*.28,-5,len*.13,1,len*.34,-2);
  ctx.bezierCurveTo(len*.56,-5,len*.57,-26,len*.43,-27);
  ctx.bezierCurveTo(len*.31,-28,len*.26,-16,len*.34,-15);
  ctx.stroke();
  ctx.restore();
 }
 ctx.restore();
}
function render(){
 if(!state)return;const now=performance.now();state.damageEffects=state.damageEffects.filter(e=>now<e.until);
 const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#a8d5f6');sky.addColorStop(1,'#e3f1fa');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
 ctx.fillStyle='#fff7c2';ctx.beginPath();ctx.arc(825,75,31,0,7);ctx.fill();drawWind(now);
 ctx.fillStyle='#7db36f';ctx.beginPath();ctx.moveTo(0,H);ctx.lineTo(0,state.heights[0]);for(let x=1;x<W;x++)ctx.lineTo(x,state.heights[x]);ctx.lineTo(W,H);ctx.closePath();ctx.fill();
 ctx.strokeStyle='#568b50';ctx.lineWidth=4;ctx.beginPath();state.heights.forEach((y,x)=>x?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();ctx.fillStyle='#567f4e';ctx.fillRect(0,GROUND,W,H-GROUND);
 drawActiveTurn(state.player,'player',now);drawActiveTurn(state.ai,'ai',now);
 drawTank(state.player,'#4e95df',1,state.currentActor==='player'?Number($('angle').value):(state.lastAngles?.player??45),'player',now);drawTank(state.ai,'#e46c66',-1,state.currentActor==='ai'?Number($('angle').value):(state.lastAngles?.ai??45),'ai',now);
 // Do not display an aiming trajectory: the player must judge angle and wind visually.
 if(state.projectile){const p=point(state.projectile,state.projectile.t);ctx.fillStyle='#f8a83b';ctx.beginPath();ctx.arc(p.x,p.y,7,0,7);ctx.fill()}
 if(state.explosion&&now<state.explosion.until){const t=1-(state.explosion.until-now)/420;ctx.strokeStyle=`rgba(255,139,35,${1-t})`;ctx.lineWidth=5;ctx.beginPath();ctx.arc(state.explosion.x,state.explosion.y,8+t*40,0,7);ctx.stroke()}
 ctx.fillStyle='#28455c';ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.fillText('1P',state.player.x,tankY(state.player)-48);ctx.fillText('2P',state.ai.x,tankY(state.ai)-48);
}
function frame(now){updateCharge(now);const elapsed=Math.min((now-last)/1000||0,.05);last=now;if(state?.projectile){const s=state.projectile;const steps=Math.max(1,Math.ceil(elapsed/DT));for(let i=0;i<steps;i++){s.t+=elapsed/steps;const p=point(s,s.t),prev=s.prev;let hit=null;for(let j=1;j<=4;j++){const f=j/4;hit=collide({x:prev.x+(p.x-prev.x)*f,y:prev.y+(p.y-prev.y)*f});if(hit)break}if(hit){finishShot(hit,s.actor);break}s.prev=p;if(s.t>5){finishShot({x:clamp(p.x,0,W-1),y:clamp(p.y,0,H),kind:'miss'},s.actor);break}}}render();raf=requestAnimationFrame(frame)}
$('new').onclick=()=>showSetup();
$('again').onclick=()=>showSetup();
$('angle').oninput=update;
// Keyboard and mobile controls share the same gameplay functions.
function adjustAngle(delta){if(!isHumanTurn()||charging)return;$('angle').value=clamp(Number($('angle').value)+delta,10,80);update()}
function cancelCharge(){if(!charging)return;charging=false;chargedPower=lastPowerByActor[currentActor()]??0;update()}
let heldPointer=null,holdTimer=null;
function stopTouchHold(){if(holdTimer!==null){clearInterval(holdTimer);holdTimer=null}heldPointer=null}
for(const button of document.querySelectorAll('#touchControls button')){
  const action=button.dataset.control;
  const act=()=>{if(!isHumanTurn()||charging)return;if(action==='left')movePlayer(-5);if(action==='right')movePlayer(5);if(action==='up')adjustAngle(ANGLE_STEP);if(action==='down')adjustAngle(-ANGLE_STEP)};
  button.addEventListener('pointerdown',e=>{
    if(!isHumanTurn()||heldPointer!==null)return;
    e.preventDefault();heldPointer={id:e.pointerId,button};button.setPointerCapture(e.pointerId);
    button.classList.add('pressed');
    if(action==='fire')beginCharge();
    else {act();holdTimer=setInterval(()=>{if(!isHumanTurn()){stopTouchHold();return}act()},115)}
  });
  button.addEventListener('pointerup',e=>{
    if(heldPointer?.id!==e.pointerId||heldPointer.button!==button)return;
    e.preventDefault();stopTouchHold();button.classList.remove('pressed');
    if(action==='fire')releaseCharge();
  });
  for(const event of ['pointercancel','lostpointercapture'])button.addEventListener(event,e=>{
    if(heldPointer?.id!==e.pointerId||heldPointer.button!==button)return;
    stopTouchHold();button.classList.remove('pressed');if(action==='fire')cancelCharge();
  });
}

window.addEventListener('keydown',e=>{
  if(!state||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;
  const isControl=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code);
  if(!isControl)return;
  e.preventDefault();
  if(!isHumanTurn())return;
  if(e.code==='Space'){if(!e.repeat)beginCharge();return;}
  if(charging)return;
  switch(e.code){
    case 'ArrowLeft':movePlayer(-5);break;
    case 'ArrowRight':movePlayer(5);break;
    case 'ArrowUp':adjustAngle(ANGLE_STEP);break;
    case 'ArrowDown':adjustAngle(-ANGLE_STEP);break;
  }
  update();
});
window.addEventListener('keyup',e=>{if(e.code==='Space'){e.preventDefault();releaseCharge()}});
window.addEventListener('blur',()=>{stopTouchHold();cancelCharge()});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopTouchHold();cancelCharge()}});
async function checkJev(){try{const r=await fetch('/api/jev/status',{cache:'no-store'});const data=await r.json();jevConfigured=r.ok&&data.configured===true}catch{jevConfigured=false}updateSetup()}
function showSetup(){stopTouchHold();gameStarted=false;charging=false;$('setup').classList.remove('hidden');$('overlay').classList.add('hidden');if(state){state.token++;state.phase='over'}updateSetup()}
function updateSetup(){const p1=$('p1type').value,p2=$('p2type').value,hasJev=p1==='jev'||p2==='jev';$('startGame').disabled=hasJev&&!jevConfigured;$('setupNotice').textContent=hasJev?(jevConfigured?'Jev 어댑터 설정됨 · 실제 API 응답을 검증하며 대전합니다.':'Jev 연결 대기 · 서버에 JEV_ADAPTER_URL 설정이 필요합니다.'):'선택한 구성으로 대전을 시작할 수 있습니다.'}
$('p1type').addEventListener('change',updateSetup);$('p2type').addEventListener('change',updateSetup);
$('startGame').onclick=()=>{if(($('p1type').value==='jev'||$('p2type').value==='jev')&&!jevConfigured)return;playerTypes={player:$('p1type').value,ai:$('p2type').value};gameStarted=true;$('setup').classList.add('hidden');newGame()};
updateSetup();checkJev();requestAnimationFrame(frame);
