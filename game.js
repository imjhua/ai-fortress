const W=960,H=500,GROUND=470,GRAVITY=480,DT=1/120,MAX_TURNS=10;
const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d');
let state,raf,last=0;
let playerTypes={player:"human",ai:"physics"},gameStarted=false,jevConfigured=false;
const actorName=a=>playerTypes[a]==="human"?(a==="player"?"1P 사용자":"2P 사용자"):"AI Player";
const actorType=a=>playerTypes[a];
const typeLabel=t=>({human:'사용자',physics:'Physics Bot',jev:'AI Player'})[t]||t;
const currentActor=()=>state?.currentActor;
const isHumanTurn=()=>gameStarted&&state?.phase==="player"&&actorType(currentActor())==="human";
const MIN_POWER=0,MAX_POWER=100,CHARGE_MS=1600,ANGLE_STEP=3;
let charging=false,chargeStart=0,chargedPower=0,lastPlayerPower=null;let lastPowerByActor={player:null,ai:null};
// Preserve the last human-fired power across opponent turns; only a new charge clears it.
// The previous fired power is a fixed visual reference, independent of charging.
function syncPowerReference(){
 const marker=$('powerReference');
 if(!marker)return;
 const valid=Number.isFinite(lastPlayerPower);
 marker.hidden=!valid;
 if(valid)marker.style.left=`${clamp(lastPlayerPower,0,100)}%`;
}
function resetCharge(){charging=false;chargedPower=0;}
function beginCharge(){if(!state||!isHumanTurn()||charging)return;charging=true;chargeStart=performance.now();chargedPower=0;update()}
function releaseCharge(){if(!charging)return;updateCharge(performance.now());const power=chargedPower;charging=false;if(isHumanTurn()){lastPlayerPower=power;lastPowerByActor[currentActor()]=power;fire(currentActor(),Number($('angle').value),power)}else update()}
function updateCharge(now){if(!charging||!isHumanTurn())return;const steps=Math.floor((now-chargeStart)/CHARGE_MS*(MAX_POWER-MIN_POWER));chargedPower=Math.min(MAX_POWER,MIN_POWER+steps);$('powerValue').textContent=chargedPower+'%';$('powerFill').style.width=chargedPower+'%';$('powerMeter').setAttribute('aria-valuenow',String(chargedPower))}
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function rng(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296}}
// Smooth the *geometry*, not just its pixels: collision and rendering share the same outline.
// A triangular weighted kernel rounds narrow spikes without flattening broad hills.
function smoothProfile(values,radius=12){
 const result=new Array(values.length);
 for(let x=0;x<values.length;x++){
  let sum=0,weight=0;
  for(let d=-radius;d<=radius;d++){
   const w=radius+1-Math.abs(d);
   sum+=values[clamp(x+d,0,values.length-1)]*w;
   weight+=w;
  }
  result[x]=sum/weight;
 }
 return result;
}
function terrain(seed){
 const r=rng(seed),a=25+r()*25,b=12+r()*22,c=7+r()*10,p=r()*6.28,q=r()*6.28;
 const h=Array.from({length:W},(_,x)=>clamp(335+a*Math.sin(x/125+p)+b*Math.sin(x/65+q)+c*Math.sin(x/34),245,405));
 // Add narrow ridges, steep valleys and erodible ledges. Tank spawn pads stay playable.
 const features=3+Math.floor(r()*3);
 for(let i=0;i<features;i++){
  const center=205+r()*550, width=38+r()*75, depth=58+r()*70;
  const ridge=r()>.55;
  for(let x=Math.max(0,Math.floor(center-width));x<Math.min(W,Math.ceil(center+width));x++){
   const u=Math.abs(x-center)/width;
   const shoulder=Math.pow(Math.max(0,1-u*u),ridge?2.5:1.4);
   h[x]=clamp(h[x]+(ridge?-1:1)*depth*shoulder,205,GROUND-12);
  }
 }
 // Exposed shelves beside each spawn allow a crater to trigger a meaningful fall.
 for(const sx of [110,850]){
  const flat=h[sx];
  for(let x=sx-35;x<=sx+35;x++){
   const d=Math.abs(x-sx),blend=clamp((d-19)/16,0,1);
   h[x]=flat*(1-blend)+h[x]*blend;
  }
  // Broad, rounded lip near each spawn instead of a sharp 57px ramp cutoff.
  const sign=sx===110?1:-1;
  const center=sx+sign*74;
  const radius=68;
  for(let x=Math.max(0,Math.floor(center-radius));x<=Math.min(W-1,Math.ceil(center+radius));x++){
   const u=(x-center)/radius;
   const bump=75*Math.pow(Math.max(0,1-u*u),2);
   h[x]=clamp(h[x]+bump,205,GROUND-12);
  }
 }
 return smoothProfile(h,14);
}
// Five seeded battlefield families. Floating islands and stacked bridges are
// independent solid bodies: empty pixels below a platform stay empty.
const MAP_TYPES=['meadow','canyon','mountain','islands','bridges'];
function makeMap(seed){
 const r=rng(seed^0x9e3779b9),kind=MAP_TYPES[Math.floor(r()*MAP_TYPES.length)];
 const heights=terrain(seed),solid=createSolidMask(heights);
 const clear=()=>solid.fill(0);
 const paint=(x,y)=>{if(x>=0&&x<W&&y>=0&&y<H)solid[y*W+x]=1};
 const platform=(left,right,center,thickness,variation=0)=>{
  for(let x=Math.max(0,Math.floor(left));x<Math.min(W,Math.ceil(right));x++){
   const u=(x-left)/(right-left),taper=Math.pow(Math.max(0,Math.sin(Math.PI*u)),.4);
   const top=center+Math.sin(u*Math.PI*3)*variation;
   const depth=thickness*taper;
   for(let y=Math.max(0,Math.floor(top));y<Math.min(H,Math.ceil(top+depth));y++)paint(x,y);
  }
 };
 if(kind==='canyon'||kind==='mountain'){
  const profile=heights.map((base,x)=>{
   if(kind==='canyon'){
    const valley=Math.exp(-Math.pow((x-480)/170,4));
    return clamp(base-45+valley*160,180,GROUND);
   }
   const ridge=75*Math.abs(Math.sin(x/118+seed*.00001));
   return clamp(base-ridge+15,160,GROUND);
  });
  const rounded=smoothProfile(profile,12);
  for(let x=0;x<W;x++)for(let y=0;y<H;y++)solid[y*W+x]=y>=rounded[x]?1:0;
 }else if(kind==='islands'){
  clear();
  platform(40,360,290+r()*25,65,11);
  platform(600,930,265+r()*40,65,12);
  platform(370,580,360,35,7);
 }else if(kind==='bridges'){
  clear();
  // Spawn platforms are wide enough for both tanks, while middle platforms
  // overlap vertically and allow shooting through newly blasted gaps.
  platform(30,385,255+r()*35,30,7);
  platform(580,935,265+r()*25,30,7);
  platform(220,670,355,23,9);
  platform(325,755,175,21,7);
 }
 return {kind,solid,heights};
}
// A 2D solid mask supports side impacts, tunnels and overhangs.
const terrainCanvas=document.createElement('canvas');terrainCanvas.width=W;terrainCanvas.height=H;
const terrainCtx=terrainCanvas.getContext('2d');
function createSolidMask(heights){
 const mask=new Uint8Array(W*H);
 for(let x=0;x<W;x++)for(let y=Math.max(0,Math.ceil(heights[x]));y<H;y++)mask[y*W+x]=1;
 return mask;
}
function isSolid(x,y){
 const ix=Math.floor(x),iy=Math.floor(y);
 return ix>=0&&ix<W&&iy>=0&&iy<H&&state.solid[iy*W+ix]===1;
}
function surfaceAt(x){
 const ix=clamp(Math.round(x),0,W-1);
 for(let y=0;y<H;y++)if(state.solid[y*W+ix])return y;
 return H;
}
function groundAt(x){return surfaceAt(x)}
// First supporting pixel at or below the tank tracks, not the highest surface.
function supportAt(x,footY){
 const ix=clamp(Math.round(x),0,W-1);
 for(let y=Math.max(0,Math.floor(footY));y<H;y++)if(state.solid[y*W+ix])return y;
 return H+100;
}
function settleTank(t){
 const target=supportAt(t.x,t.y+12-22);
 if(target>t.y+12+1){
  const fall=target-(t.y+12);
  t.y=target-12;
  if(target>=H){t.hp=0;return 100}
  if(fall>40){const damage=Math.min(75,Math.floor((fall-40)*.35));t.hp=clamp(t.hp-damage,0,100);return damage}
 }else if(target<t.y+12){t.y=target-12}
 return 0;
}
// Terrain collision stays at 960x500. Visuals are supersampled independently
// so sloping floating platforms remain smooth on high-density displays.
const TERRAIN_RENDER_SCALE=3;
terrainCanvas.width=W*TERRAIN_RENDER_SCALE;
terrainCanvas.height=H*TERRAIN_RENDER_SCALE;
// Extract contours from the collision mask using marching squares. The binary
// mask remains authoritative for physics; the visual outline is a vector path.
function terrainContours(solid){
 const edges=[];
 const at=(x,y)=>x>=0&&x<W&&y>=0&&y<H?solid[y*W+x]:0;
 // March over a one-cell empty border so islands and ground are closed loops.
 for(let y=-1;y<H;y++)for(let x=-1;x<W;x++){
  const a=at(x,y),b=at(x+1,y),c=at(x+1,y+1),d=at(x,y+1);
  const mask=a|(b<<1)|(c<<2)|(d<<3);
  if(mask===0||mask===15)continue;
  const points=[[(x+.5),y],[x+1,y+.5],[x+.5,y+1],[x,y+.5]];
  const crossing=[];
  if(a!==b)crossing.push(0);
  if(b!==c)crossing.push(1);
  if(c!==d)crossing.push(2);
  if(d!==a)crossing.push(3);
  if(crossing.length===2)edges.push([points[crossing[0]],points[crossing[1]]]);
  else if(crossing.length===4){
   // Keep diagonally touching solid cells separate, avoiding phantom bridges.
   const pairs=mask===5?[[0,3],[1,2]]:[[0,1],[2,3]];
   for(const [i,j] of pairs)edges.push([points[i],points[j]]);
  }
 }
 const key=p=>`${Math.round(p[0]*2)},${Math.round(p[1]*2)}`;
 const links=new Map();
 edges.forEach(([a,b],i)=>{
  for(const p of [a,b]){const k=key(p);if(!links.has(k))links.set(k,[]);links.get(k).push(i)}
 });
 const used=new Uint8Array(edges.length),contours=[];
 for(let i=0;i<edges.length;i++){
  if(used[i])continue;
  const path=[],first=edges[i][0],start=key(first);
  let current=first,edgeId=i,guard=0;
  while(edgeId!==undefined&&!used[edgeId]&&guard++<edges.length+1){
   used[edgeId]=1;path.push(current);
   const [a,b]=edges[edgeId],next=key(a)===key(current)?b:a;
   if(key(next)===start)break;
   const candidates=links.get(key(next))||[];
   edgeId=candidates.find(id=>!used[id]);current=next;
  }
  if(path.length>=3)contours.push(path);
 }
 return contours;
}
// Resample closed mask contours by distance, then remove quantization noise
// BEFORE creating curves. Physics still reads the original binary mask.
function smoothTerrainContour(points){
 if(points.length<8)return points;
 const distances=[0];
 for(let i=1;i<=points.length;i++){
  const a=points[i-1],b=points[i%points.length];
  distances.push(distances[i-1]+Math.hypot(b[0]-a[0],b[1]-a[1]));
 }
 const length=distances[points.length];
 if(length<16)return points;
 const count=Math.max(8,Math.ceil(length/2));
 const step=length/count;
 const sampled=[];
 let segment=0;
 for(let i=0;i<count;i++){
  const target=i*step;
  while(segment<points.length-1&&distances[segment+1]<target)segment++;
  const a=points[segment],b=points[(segment+1)%points.length];
  const fraction=(target-distances[segment])/Math.max(1e-6,distances[segment+1]-distances[segment]);
  sampled.push([a[0]+(b[0]-a[0])*fraction,a[1]+(b[1]-a[1])*fraction]);
 }
 // Circular Gaussian filter: sigma about 2.5 world pixels, enough to
 // remove 1px stair steps without rounding away craters or thin bridges.
 const sigma=4.0/step, radius=Math.max(1,Math.ceil(sigma*3));
 const weights=[];let sum=0;
 for(let j=-radius;j<=radius;j++){
  const weight=Math.exp(-.5*(j/sigma)**2);
  weights.push(weight);sum+=weight;
 }
 return sampled.map((_,i)=>{
  let x=0,y=0;
  for(let j=-radius;j<=radius;j++){
   const q=sampled[(i+j+count)%count],w=weights[j+radius];
   x+=q[0]*w;y+=q[1]*w;
  }
  return [x/sum,y/sum];
 });
}
function rebuildTerrainImage(){
 const contours=terrainContours(state.solid);
 // Keep the original daytime terrain palette for every map family.
 const base='#7cab70';
 const rim='#568b50';
 const scale=TERRAIN_RENDER_SCALE;
 terrainCtx.setTransform(1,0,0,1,0,0);
 terrainCtx.clearRect(0,0,terrainCanvas.width,terrainCanvas.height);
 terrainCtx.save();terrainCtx.scale(scale,scale);
 terrainCtx.lineJoin='round';terrainCtx.lineCap='round';
 const path=new Path2D();
 for(const raw of contours){
  const contour=smoothTerrainContour(raw),n=contour.length;
  if(n<3)continue;
  path.moveTo(contour[0][0],contour[0][1]);
  // Periodic Catmull-Rom converted to cubic Bezier: smooth first derivatives
  // at every segment boundary, including the closing segment.
  for(let i=0;i<n;i++){
   const p0=contour[(i-1+n)%n],p1=contour[i];
   const p2=contour[(i+1)%n],p3=contour[(i+2)%n];
   const tension=1/6;
   path.bezierCurveTo(
    p1[0]+(p2[0]-p0[0])*tension,p1[1]+(p2[1]-p0[1])*tension,
    p2[0]-(p3[0]-p1[0])*tension,p2[1]-(p3[1]-p1[1])*tension,
    p2[0],p2[1]
   );
  }
  path.closePath();
 }
 terrainCtx.fillStyle=base;
 terrainCtx.fill(path,'evenodd');
 terrainCtx.strokeStyle=rim;terrainCtx.lineWidth=2.4;
 terrainCtx.stroke(path);
 terrainCtx.restore();
}

function tankY(t){return t.y}
// Estimate the local ground tangent under the tank's tracks.
// Positive screen Y points downward, so uphill to the right gives a negative angle.
function tankSlope(t){
 const halfTrack=17;
 const left=supportAt(t.x-halfTrack,t.y+6),right=supportAt(t.x+halfTrack,t.y+6);
 return clamp(Math.atan2(right-left,halfTrack*2),-Math.PI/5,Math.PI/5);
}
function turretPivot(t){
 const a=tankSlope(t),c=Math.cos(a),s=Math.sin(a);
 return {x:t.x+14*s,y:tankY(t)-14*c};
}
function log(msg){}
function newGame(){const seed=Math.floor(Math.random()*2**32);const map=makeMap(seed);state={seed,mapType:map.kind,heights:map.heights,solid:map.solid,player:{x:110,y:0,hp:100},ai:{x:850,y:0,hp:100},wind:openingWind(),phase:'player',currentActor:'player',round:1,shots:0,score:0,direct:0,projectile:null,explosion:null,damageEffects:[],matchId:crypto.randomUUID?.()||String(Date.now()),turnId:0,token:(state?.token||0)+1,aiProvider:'local',winner:null};state.player.y=supportAt(110,0)-12;state.ai.y=supportAt(850,0)-12;rebuildTerrainImage();$('overlay').classList.add('hidden');lastPlayerPower=null;lastPowerByActor={player:null,ai:null};resetCharge();resetDecisionPanel();$('angle').value=45;log(`새 게임 시작 · 지형 시드 ${seed}`);update();syncTurnProfile('newGame:after-update');render();const initialToken=state.token;requestAnimationFrame(()=>{if(gameStarted&&state?.token===initialToken)syncTurnProfile('newGame:first-frame')});scheduleBot()}
// The first wind is assigned when the match state is created, never left at 0.
function openingWind(){
 const strength=1+Math.floor(Math.random()*10);
 return (Math.random()<0.5?-1:1)*strength;
}
function nextWind(){
 // Subsequent turns can be calm, but the opening turn cannot.
 state.wind=Math.floor(Math.random()*21)-10;
}
// Terrain movement is collision-based: tanks may climb gentle slopes, not cliffs.
// Check the leading track edge as well as the center, so a tank cannot clip
// into a vertical wall before its center reaches it.
const TANK_TRACK_HALF_WIDTH=17;
const MAX_CLIMB_PER_PIXEL=0.85; // maximum slope the tracks can climb
const MAX_STEP_HEIGHT=3;
// Probe the terrain near the current tracks. Unlike a global surface query,
// this supports floating platforms and does not snap to a bridge overhead.
function trackFloor(x, feet){
  return supportAt(x, feet-22);
}
function canMoveTank(fromX,toX,t){
 const direction=Math.sign(toX-fromX);
 if(!direction)return true;
 let feet=t.y+12;
 // Walk the movement one pixel at a time, updating the expected track height.
 // This prevents a gentle slope from being mistaken for a vertical wall.
 for(let x=fromX+direction;direction>0?x<=toX+0.1:x>=toX-0.1;x+=direction){
  const previous=trackFloor(x-direction,feet);
  const next=trackFloor(x,feet);
  if(next>=H+100){ // walking off a ledge is allowed; gravity handles the fall
   continue;
  }
  const rise=previous-next;
  if(rise>MAX_STEP_HEIGHT || rise>MAX_CLIMB_PER_PIXEL+0.6)return false;
  // The leading track may sit above an incline, but must not clip a wall.
  // Compare the front against the same point on the previous step, not the
  // tank center (which would incorrectly reject normal slopes).
  const front=x+direction*TANK_TRACK_HALF_WIDTH;
  const prevFront=front-direction;
  const frontFloor=trackFloor(front,feet);
  const prevFrontFloor=trackFloor(prevFront,feet);
  if(frontFloor<H+100&&prevFrontFloor<H+100&&prevFrontFloor-frontFloor>MAX_STEP_HEIGHT)return false;
  feet=next;
 }
 return true;
}

function movePlayer(delta){
 if(!isHumanTurn())return;
 const actor=currentActor(),t=state[actor],other=state[actor==='player'?'ai':'player'];
 const next=clamp(t.x+delta,25,W-25);
 if(Math.abs(next-other.x)<45)return;
 if(canMoveTank(t.x,next,t)){
  t.x=next;
  settleTank(t);
  if(t.hp<=0)endGame();
 }
}

// v5.9: opt-in turn/HUD diagnostics. Enable with ?debugTurn=1 or localStorage.setItem('fortressDebugTurn','1').
const debugTurnEnabled = new URLSearchParams(location.search).has('debugTurn') || localStorage.getItem('fortressDebugTurn') === '1';
let turnDebugSequence = 0;
function traceTurnProfile(reason){
 if(!debugTurnEnabled)return;
 const hud=document.querySelector('.hud');
 const cards=['p1hud','p2hud'].map(id=>{
  const el=$(id),css=getComputedStyle(el),rect=el.getBoundingClientRect();
  return {id,classes:el.className,attribute:el.getAttribute('data-current-turn'),
   border:css.border,outline:css.outline,background:css.backgroundColor,
   visible:rect.width>0&&rect.height>0,selectorMatches:el.matches('[data-current-turn="true"]')};
 });
 console.info('[FORTRESS:TURN]',++turnDebugSequence,reason,{
  gameStarted,phase:state?.phase,currentActor:state?.currentActor,
  setupHidden:$('setup').classList.contains('hidden'),hudActivePlayer:hud?.dataset.activePlayer,
  cards
 });
}
// The HUD, turn label and tank badges all derive from state.currentActor.
// No independent "focused player" state is stored.
function syncTurnProfile(reason="sync"){
 // Single source of truth: the actor that owns the current turn.
 const active = gameStarted && state?.phase !== 'over' ? state.currentActor : 'none';
 const hud = document.querySelector('.hud');
 hud.dataset.activePlayer = active;
 for(const [actor,id] of [['player','p1hud'],['ai','p2hud']]){
  const card=$(id),selected=active===actor;
  card.classList.toggle('active-turn',selected);
  if(selected){
   card.setAttribute('data-current-turn','true');
   card.setAttribute('aria-current','true');
  }else{
   card.removeAttribute('data-current-turn');
   card.removeAttribute('aria-current');
  }
 }
 traceTurnProfile(reason);
}

function update(){if(!state)return;const a=state.currentActor;const human=isHumanTurn();$('php').textContent=state.player.hp;$('ahp').textContent=state.ai.hp;$('pbar').style.width=state.player.hp+'%';$('abar').style.width=state.ai.hp+'%';$('p1hpMeter').setAttribute('aria-valuenow',String(state.player.hp));$('p2hpMeter').setAttribute('aria-valuenow',String(state.ai.hp));$('pbar').classList.toggle('hp-critical',state.player.hp<=25);$('abar').classList.toggle('hp-critical',state.ai.hp<=25);$('p1name').textContent=playerTypes.player!=='human'?'AI Player':'1P 사용자';$('p2name').textContent=playerTypes.ai!=='human'?'AI Player':'2P 사용자';$('turn').textContent=state.phase==='player'?`${actorName(a)} 턴`:({flight:'포탄 비행 중',resolve:'폭발!',over:'게임 종료'})[state.phase];$('round').textContent=`ROUND ${state.round}/${MAX_TURNS}`;$('powerValue').textContent=chargedPower+'%';$('powerFill').style.width=chargedPower+'%';$('powerMeter').setAttribute('aria-valuenow',String(chargedPower));syncPowerReference();syncTurnProfile();document.querySelectorAll('#touchControls button').forEach(button=>button.disabled=!human);$('angle').disabled=!human;$('powerMeter').setAttribute('aria-disabled',String(!human));$('powerValue').closest('.controls').classList.toggle('is-inactive',!human);$('touchControls').classList.toggle('is-inactive',!human)}
function scheduleBot(){if(!gameStarted||state.phase!=='player'||!['physics','jev'].includes(actorType(currentActor())))return;const token=state.token,actor=currentActor();setTimeout(()=>{if(token===state.token&&state.phase==='player'&&currentActor()===actor)(actorType(actor)==='jev'?jevTurn(token,actor):botTurn(token,actor))},450)}

const BARREL_LENGTH=31;
const BARREL_WIDTH=9;
// The rounded barrel cap extends half the stroke width beyond its centerline.
// Use this same visible muzzle point for drawing and projectile spawning.
function muzzlePoint(t,angle,direction){
 const r=angle*Math.PI/180,p=turretPivot(t);
 const length=BARREL_LENGTH+BARREL_WIDTH/2;
 return {x:p.x+direction*Math.cos(r)*length,y:p.y-Math.sin(r)*length};
}
function origin(t,angle,direction){return muzzlePoint(t,angle,direction)}
function point(shot,t){const r=shot.angle*Math.PI/180,v=shot.power*8;return{x:shot.x+shot.dir*v*Math.cos(r)*t+state.wind*6*t*t,y:shot.y-v*Math.sin(r)*t+.5*GRAVITY*t*t}}
function collide(p){if(p.x<0||p.x>=W||p.y>H+80)return {x:clamp(p.x,0,W-1),y:clamp(p.y,0,H),kind:'miss'};for(const [name,t] of [['player',state.player],['ai',state.ai]]){if(Math.abs(p.x-t.x)<17&&Math.abs(p.y-(tankY(t)-7))<15)return{x:p.x,y:p.y,kind:'tank',target:name}}if(isSolid(p.x,p.y))return{x:p.x,y:p.y,kind:'ground'};return null}
function simulate(shot){let prev={x:shot.x,y:shot.y};for(let i=1;i<1400;i++){const t=i*DT,p=point(shot,t);const steps=4;for(let j=1;j<=steps;j++){const f=j/steps,s={x:prev.x+(p.x-prev.x)*f,y:prev.y+(p.y-prev.y)*f};const hit=collide(s);if(hit)return hit}prev=p}return{x:prev.x,y:prev.y,kind:'miss'}}
function crater(x,y,radius){
 const minX=clamp(Math.floor(x-radius),0,W-1),maxX=clamp(Math.ceil(x+radius),0,W-1);
 const minY=clamp(Math.floor(y-radius),0,H-1),maxY=clamp(Math.ceil(y+radius),0,H-1);
 const rr=radius*radius;
 for(let yy=minY;yy<=maxY;yy++)for(let xx=minX;xx<=maxX;xx++){
  if((xx-x)**2+(yy-y)**2<=rr)state.solid[yy*W+xx]=0;
 }

 rebuildTerrainImage();
}
function damageAt(x,y,target){const d=Math.hypot(target.x-x,(tankY(target)-7)-y);return Math.round(40*Math.max(0,1-d/56))}
function finishShot(hit,actor){
 state.phase='resolve';
 const before={player:state.player.hp,ai:state.ai.hp};
 if(hit.kind!=='miss'){
  // Damage the actual impact point, including the side/underside of bridges.
  crater(hit.x,hit.y,hit.kind==='tank'?38:32);
 }
 const damages={};
 for(const name of ['player','ai']){
  const t=state[name];
  const blast=hit.kind==='miss'?0:damageAt(hit.x,hit.y,t);
  const direct=hit.target===name?Math.max(blast,32):blast;
  t.hp=clamp(t.hp-direct,0,100);
  settleTank(t); // falls through broken platforms, may land on a lower bridge
  damages[name]=before[name]-t.hp;
 }
 if(actor==='player'){
  state.score+=damages.ai*10;
  if(hit.target==='ai'){state.score+=100;state.direct++}
 }
 state.explosion={x:hit.x,y:hit.y,until:performance.now()+420};
 for(const name of ['player','ai'])if(damages[name]>0){state.damageEffects.push({name,damage:damages[name],started:performance.now(),until:performance.now()+1100})}
 state.projectile=null;update();
 const token=state.token;
 setTimeout(()=>{
  if(token!==state.token)return;
  if(state.player.hp<=0||state.ai.hp<=0||(state.round>=MAX_TURNS&&actor==='ai')){endGame();return}
  if(actor==='player')state.currentActor='ai';else{state.round++;state.currentActor='player'}
  state.phase='player';nextWind();update();scheduleBot();
 },500);
}
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
function endGame(){state.phase='over';state.winner=state.ai.hp===state.player.hp?'draw':state.ai.hp<state.player.hp?'player':'ai';if(state.winner==='player')state.score+=1000+state.player.hp*5+Math.max(0,MAX_TURNS-state.round)*50;else if(state.winner==='draw')state.score+=300;$('resultTitle').textContent=state.winner==='draw'?'🤝 무승부':`🏆 ${state.winner==='player'?$('p1name').textContent:$('p2name').textContent} 승리!`;$('overlay').classList.remove('hidden');update()}
function drawActiveTurn(t,name,now){
 if(!gameStarted||state.phase!=='player'||state.currentActor!==name)return;
 const y=tankY(t),pulse=(Math.sin(now*.005)+1)/2;
 ctx.save();
 ctx.strokeStyle=name==='player'?`rgba(45,129,242,${.5+pulse*.4})`:`rgba(236,89,76,${.5+pulse*.4})`;
 ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(t.x,y+1,27+pulse*5,9+pulse*2,0,0,Math.PI*2);ctx.stroke();
 const label=actorName(name);
 const ly=Math.max(42,y-88);
 ctx.fillStyle=name==='player'?'#246cbb':'#bc504b';
 ctx.font='bold 12px system-ui,sans-serif';const labelWidth=Math.max(94,Math.ceil(ctx.measureText(label).width)+24);ctx.beginPath();ctx.roundRect(t.x-labelWidth/2,ly-19,labelWidth,25,7);ctx.fill();
 ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 12px system-ui,sans-serif';ctx.fillText(label,t.x,ly-6);
 ctx.fillStyle=name==='player'?'#246cbb':'#bc504b';ctx.beginPath();ctx.moveTo(t.x-6,ly+6);ctx.lineTo(t.x+6,ly+6);ctx.lineTo(t.x,ly+14);ctx.closePath();ctx.fill();
 ctx.restore();
}
function drawTank(t,color,dir,angle,name,now){
 const y=tankY(t),effect=state.damageEffects.find(e=>e.name===name&&now<e.until);
 const elapsed=effect?now-effect.started:0;
 const shake=effect&&state.projectile?.actor!==name&&elapsed<350?Math.sin(elapsed*.11)*Math.max(0,1-elapsed/350)*5:0;
 ctx.save();ctx.translate(t.x+shake,y);
 // Keep the tank, muzzle and projectile in the same canvas coordinate system.
 // Scaling the tank alone offsets the visible barrel tip from the launch origin.
 if(effect&&Math.floor(elapsed/85)%2===0){ctx.shadowColor='#ff3b30';ctx.shadowBlur=22;}
 // The chassis follows the tangent of the terrain, while the barrel keeps
 // its absolute aiming angle. This matches the projectile's launch direction.
 const slope=tankSlope(t);
 ctx.rotate(slope);
 ctx.fillStyle='#27374a';ctx.fillRect(-21,-6,42,12);
 ctx.fillStyle=effect&&Math.floor(elapsed/100)%2===0?'#fff0b4':color;ctx.fillRect(-16,-18,32,17);
 ctx.rotate(-slope);
 const pivotX=14*Math.sin(slope),pivotY=-14*Math.cos(slope);
 ctx.strokeStyle='#1f3549';ctx.lineWidth=BARREL_WIDTH;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(pivotX,pivotY);
 ctx.lineTo(pivotX+dir*Math.cos(angle*Math.PI/180)*BARREL_LENGTH,pivotY-Math.sin(angle*Math.PI/180)*BARREL_LENGTH);
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
// Keep physics in 960x500 world coordinates, but draw the complete stage at
// a higher backing resolution. CSS enlargement of a 960px canvas was still
// magnifying jagged edges even after contour smoothing.
let stageScale=0;
function syncStageResolution(){
 const cssWidth=canvas.getBoundingClientRect().width||W;
 const pixelRatio=Math.min(3,Math.max(2,window.devicePixelRatio||1));
 const desiredScale=Math.max(2,cssWidth/W*pixelRatio);
 const scale=Math.min(3.5,desiredScale);
 const width=Math.round(W*scale),height=Math.round(H*scale);
 if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
 stageScale=canvas.width/W;
 ctx.setTransform(stageScale,0,0,stageScale,0,0);
}
function render(){
 if(!state)return;
 syncStageResolution();const now=performance.now();state.damageEffects=state.damageEffects.filter(e=>now<e.until);
 const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#a8d5f6');sky.addColorStop(1,'#e3f1fa');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
 ctx.fillStyle='#fff7c2';ctx.beginPath();ctx.arc(825,75,31,0,7);ctx.fill();drawWind(now);
 ctx.save();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(terrainCanvas,0,0,W,H);ctx.restore();
 drawActiveTurn(state.player,'player',now);drawActiveTurn(state.ai,'ai',now);
 const visibleAngle=(actor)=>state.projectile?.actor===actor?state.projectile.angle:(state.currentActor===actor&&state.phase==='player'&&isHumanTurn()?Number($('angle').value):(state.lastAngles?.[actor]??45));
 drawTank(state.player,'#4e95df',1,visibleAngle('player'),'player',now);drawTank(state.ai,'#e46c66',-1,visibleAngle('ai'),'ai',now);
 // Do not display an aiming trajectory: the player must judge angle and wind visually.
 if(state.projectile){const p=point(state.projectile,state.projectile.t);ctx.fillStyle='#f8a83b';ctx.beginPath();ctx.arc(p.x,p.y,7,0,7);ctx.fill()}
 if(state.explosion&&now<state.explosion.until){const t=1-(state.explosion.until-now)/420;ctx.strokeStyle=`rgba(255,139,35,${1-t})`;ctx.lineWidth=5;ctx.beginPath();ctx.arc(state.explosion.x,state.explosion.y,8+t*40,0,7);ctx.stroke()}
 ctx.fillStyle='#28455c';ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.fillText(actorName('player'),state.player.x,tankY(state.player)-48);ctx.fillText(actorName('ai'),state.ai.x,tankY(state.ai)-48);
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
  if(!$('setup').classList.contains('hidden'))return; // Let Space activate the focused Start button.
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
window.addEventListener('keyup',e=>{if(e.code==='Space'&&$('setup').classList.contains('hidden')){e.preventDefault();releaseCharge()}});
window.addEventListener('blur',()=>{stopTouchHold();cancelCharge()});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopTouchHold();cancelCharge()}});
async function checkJev(){try{const r=await fetch('/api/jev/status',{cache:'no-store'});const data=await r.json();jevConfigured=r.ok&&data.configured===true}catch{jevConfigured=false}updateSetup()}
function showSetup(){stopTouchHold();gameStarted=false;charging=false;$('setup').classList.remove('hidden');$('overlay').classList.add('hidden');if(state){state.token++;state.phase='over'}updateSetup();syncTurnProfile();$('startGame').focus({preventScroll:true})}
function updateSetup(){
 const p1=$('p1type').value,p2=$('p2type').value,hasAi=p1==='physics'||p2==='physics';
 const toggle=$('useJev');toggle.disabled=!hasAi;
 const wantsJev=hasAi&&toggle.checked;
 $('startGame').disabled=wantsJev&&!jevConfigured;
}
for(const id of ['p1type','p2type','useJev'])$(id).addEventListener('change',updateSetup);
$('startGame').onclick=()=>{
 const wantsJev=$('useJev').checked;
 if(wantsJev&&!jevConfigured)return;
 playerTypes={player:$('p1type').value,ai:$('p2type').value};
 if(wantsJev)for(const actor of ['player','ai'])if(playerTypes[actor]==='physics')playerTypes[actor]='jev';
 gameStarted=true;$('setup').classList.add('hidden');$('startGame').blur();newGame();traceTurnProfile('startGame:after-newGame');
};
updateSetup();$('startGame').focus({preventScroll:true});checkJev();requestAnimationFrame(frame);
