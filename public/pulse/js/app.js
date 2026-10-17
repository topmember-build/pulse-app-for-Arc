//#DOM_START
(function(){
const N=SIM.N,BLOCKS=SIM.blocks,STATES=SIM.states;
const KINDS={F:'wallet',A:'linked',B:'linked',R:'diffuse',P:'contract',X:'contract',W:'wallet'};
const KIND_LABEL={linked:'Wallets that behave like one group',wallet:'Single wallet',diffuse:'Many unrelated holders',contract:'Known contract, left out of linking'};
const IDS=SIM.ids,NAMES=SIM.names;
const SERIF='"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif';
const SANS='"Avenir Next","Segoe UI",system-ui,sans-serif';
const BONE='234,223,206',ART='#ff5a45',VEN='#4fb5e6',AMBER='245,184,61',VEIN_RGB='111,150,214',ART_RGB='224,87,74';
const BLOCK_S=.45;
const $=id=>document.getElementById(id);
const stage=$('stage'),g=stage.getContext('2d');
const ecg=$('ecg'),ge=ecg.getContext('2d');
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const WOB=reduce?0:1;

let W=0,H=0,DPR=1,area={x:0,y:0,w:100,h:100},S=1,mobile=false,heartR=50;
let mode='token';
let curB=0,blockAcc=0,tail=0,playing=false,started=false,speed=1,simTime=0,realTime=0,beatAt=-10,beatAmp=.6;
let particles=[],selected=null,flagAnim={},chipSig='',panelWas=false,tipUntil=0,scrubbing=false;
let cur=STATES[0];
// contract mode
let C=null,cNext=0,cBeats=[],cPanelOpen=false,cFlash=null,cScore=0,cChipRects=[];
const cn={OWN:{},USR:{},TOP:{}};

const NP={F:[.13,.17],A:[.14,.66],B:[.3,.9],R:[.88,.47],P:[.5,.5],X:[.82,.84],W:[.8,.1]};
const NPC={OWN:[.15,.2],USR:[.86,.5],TOP:[.2,.78]};
const disp={};
IDS.forEach(id=>disp[id]={x:0,y:0,r:0,share:0,init:false,ph:Math.random()*6});
['OWN','USR','TOP'].forEach(id=>Object.assign(cn[id],{x:0,y:0,r:0,init:false,ph:Math.random()*6}));

/* vessels: veins carry buys into the pool, arteries carry sells out, bone-coloured vessels are wallet-to-wallet transfers */
const LANE_C={F:.18,A:.1,B:.12,R:.08,W:.12};
const EDGES=[];
['F','A','B','R','W'].forEach(c=>EDGES.push({a:c,b:'P',lane:'in',c:LANE_C[c],key:c+'>P'}));
['A','B','R','W'].forEach(c=>EDGES.push({a:'P',b:c,lane:'out',c:-LANE_C[c],key:'P>'+c}));
[['F','A',.12],['F','B',-.12],['A','X',.2],['B','X',.12],['R','X',.15],['A','B',.16]].forEach(([a,b,c])=>EDGES.push({a,b,c,lane:'plain',key:[a,b].sort().join('-')}));
const EBY={};
EDGES.forEach((E,i)=>{EBY[E.a+'>'+E.b]={i,dir:1};if(E.lane==='plain')EBY[E.b+'>'+E.a]={i,dir:-1};});
const EP=EDGES.map(()=>null);
let CEDGES=[],CEP=[],CE_DEP=0,CE_WD=1;

const ADDR={F:'0x7e21…a0c4',P:'0x3b90…12ef',X:'0xc4d8…7b05',W:'0x91af…e3d6'};
const hex=n=>Array.from({length:n},()=>'0123456789abcdef'[Math.floor(Math.random()*16)]).join('');
const addrOf=id=>(mode==='token'?ADDR[id]:null)||('0x'+hex(4)+'…'+hex(4));
const fmtPct=x=>x.toFixed(1)+'%';
const fmtUsd=x=>'$'+Math.round(x).toLocaleString('en-US');
const nameOf=id=>mode==='token'?NAMES[id]:({USR:'Recent users',P:C.name,OWN:'Admin wallet',TOP:C.top?C.top.label:''}[id]||id);


/* ---------- plain-language helpers ---------- */
const GLOSS={
 'liquidity pool':'The shared pot of money that a token trades against. Buyers add money to it and sellers take money out.',
 'liquidity':'Money available to trade against. If it is pulled out, the token can become impossible to sell.',
 'multisig':'A wallet that needs several people to approve each action, like a safe that needs three of five keys.',
 'timelock':'A built-in waiting period. Changes are announced first and only take effect after the delay.',
 'upgradeable':'The contract\'s code can be swapped for new code later, while keeping the same address.',
 'proxy':'A contract that points to other code, which lets the owner replace that code later.',
 'mint':'Creating brand-new tokens. More tokens in circulation usually means each one is worth less.',
 'sell tax':'A fee taken when you sell. Fair ones are small. Traps set it close to 100%.',
 'blacklist':'A list of wallets that are blocked from using the token.',
 'honeypot':'A token you can buy but cannot sell.',
 'bytecode':'The compiled program stored onchain. It is what actually runs, even when the readable source is not published.',
 'reentrancy':'A bug that lets a contract be tricked into paying out more than once.',
 'approvals':'Permission you give a contract to spend your tokens.',
 'supply':'The total number of tokens that exist.',
 'fan-out':'One wallet sending money to many brand-new wallets.',
 'exchange':'A service where people trade tokens for other assets or cash. Moving tokens there is often a step before selling.',
 'simulation':'A dry run of a transaction that spends no real money, used to see what would happen.',
 'verified':'The creator published the readable code and it matches the version that is live.'
};
const TERM_RE=new RegExp('\\b('+Object.keys(GLOSS).sort((a,b)=>b.length-a.length).map(k=>k.replace(/[-]/g,'\\-')).join('|')+')\\b','gi');
function T(text){
  const used={};
  return String(text).replace(TERM_RE,m=>{const k=m.toLowerCase();if(used[k])return m;used[k]=1;return `<span class="term" role="button" tabindex="0" data-term="${k}">${m}</span>`;});
}
function showGloss(el){
  const k=el.dataset.term,gl=$('gloss');
  gl.innerHTML=`<b>${k.charAt(0).toUpperCase()+k.slice(1)}</b><br>${GLOSS[k]}`;
  gl.hidden=false;
  const r=el.getBoundingClientRect(),gw=gl.offsetWidth,gh=gl.offsetHeight;
  gl.style.left=Math.max(8,Math.min(innerWidth-gw-8,r.left))+'px';
  gl.style.top=(r.bottom+gh+14>innerHeight?Math.max(8,r.top-gh-8):r.bottom+8)+'px';
}
document.addEventListener('click',e=>{
  const t=e.target.closest('.term');
  if(t){e.stopPropagation();e.preventDefault();showGloss(t);return;}
  if(!e.target.closest('#gloss'))$('gloss').hidden=true;
  if(!e.target.closest('#more')&&e.target.id!=='morebtn')closeMore();
},true);
document.addEventListener('keydown',e=>{
  if((e.key==='Enter'||e.key===' ')&&e.target.classList&&e.target.classList.contains('term')){e.preventDefault();showGloss(e.target);}
  if(e.key==='Escape'){if(!$('auth').hidden)closeAuth();$('gloss').hidden=true;closeMore();if(!$('simple').hidden)closeSimple();else if(tour)endTour(false);}
});
function closeMore(){$('more').hidden=true;$('morebtn').setAttribute('aria-expanded','false');}

/* ---------- layout ---------- */
function resize(){
  DPR=Math.min(2,window.devicePixelRatio||1);
  W=innerWidth;H=innerHeight;
  stage.width=W*DPR;stage.height=H*DPR;
  ecg.width=ecg.clientWidth*DPR;ecg.height=ecg.clientHeight*DPR;
  layout();
}
function layout(){
  mobile=W<720;
  const top=mobile?138:112;
  let bottom=mobile?162:154,right=mobile?14:40;
  const panel=$('panel');
  if(!panel.hidden){if(mobile)bottom+=Math.min(panel.offsetHeight,H*.42)+6;else right+=350;}
  const left=mobile?14:40;
  area={x:left,y:top,w:Math.max(200,W-left-right),h:Math.max(mobile?230:200,H-top-bottom)};
  S=Math.max(.55,Math.min(1.5,Math.min(area.w,area.h)/520));
  heartR=Math.max(40,Math.min(190,Math.min(area.w,area.h)*(mobile?.2:.235)));
  IDS.forEach(id=>{const d=disp[id];const ny=(mobile&&id==='B')?.93:NP[id][1];d.tx=area.x+NP[id][0]*area.w;d.ty=area.y+ny*area.h;if(!d.init){d.x=d.tx;d.y=d.ty;d.init=true;}});
  ['OWN','USR','TOP'].forEach(id=>{const d=cn[id];d.tx=area.x+NPC[id][0]*area.w;d.ty=area.y+NPC[id][1]*area.h;if(!d.init){d.x=d.tx;d.y=d.ty;d.init=true;}});
}
function heartGeom(){
  const d=disp.P,u=heartR,cx=d.x,cy=d.y+.15*u;
  return {cx,cy,u,inflow:[cx+HEART_PORTS.inflow[0]*u,cy+HEART_PORTS.inflow[1]*u],outflow:[cx+HEART_PORTS.outflow[0]*u,cy+HEART_PORTS.outflow[1]*u]};
}

/* ---------- beat ---------- */
function pulseCurve(dt){if(dt<0)return 0;return Math.exp(-dt*9)+(dt>.2?.55*Math.exp(-(dt-.2)*10):0);}
function pulseNow(delay){
  if(mode==='token'&&!started)return .5*pulseCurve((realTime%1.4)-delay);
  return beatAmp*pulseCurve(simTime-beatAt-delay);
}

/* ---------- token mode: playback ---------- */
function spawnBlock(b){
  beatAt=simTime;
  beatAmp=.45+.55*Math.min(1,Math.log(1+SIM.cnt[b])/Math.log(1+60));
  for(const tx of BLOCKS[b]){
    const hit=EBY[tx.from+'>'+tx.to];if(!hit)continue;
    const m=Math.min(tx.n,3);
    for(let i=0;i<m;i++)particles.push({ei:hit.i,dir:hit.dir,t0:simTime+Math.random()*.35,dur:.95+Math.random()*.2,type:tx.type,usd:tx.usd/tx.n,from:tx.from,to:tx.to,blk:b,af:addrOf(tx.from),at:addrOf(tx.to),x:-99,y:-99});
  }
  if(particles.length>900)particles.splice(0,particles.length-900);
}
function onBlock(b){
  cur=STATES[b];spawnBlock(b);
  cur.flags.forEach(f=>{if(f.block===b)flagAnim[f.id]=simTime;});
  updateAll();
}
function seek(b){
  if(b<=0)summaryAuto=false;
  curB=Math.max(0,Math.min(N-1,b));blockAcc=0;tail=0;particles=[];flagAnim={};
  cur=STATES[curB];beatAt=simTime;hideTip();updateAll();
}
function syncPlay(){$('play').textContent=playing?'Pause':(curB>=N-1?'Replay':'Play');}
function play(){if(curB>=N-1)seek(0);playing=true;syncPlay();}
function pause(){playing=false;syncPlay();}

/* ---------- contract mode: live beats ---------- */
function setupContract(c){
  C=c;cScore=scoreOf(c);particles=[];cBeats=[];cNext=simTime+.3;cFlash=null;selected=null;
  CEDGES=[
    {a:'USR',b:'P',lane:'in',c:.1},
    {a:'P',b:'USR',lane:'out',c:-.1}
  ];
  c.powers.forEach((p,i)=>CEDGES.push({a:'P',b:'OWN',lane:'pow',c:-.34+i*.2,power:p,t:.3+i*.13}));
  if(c.top)CEDGES.push({a:'TOP',b:'P',lane:'plain',c:.1});
  CEP=CEDGES.map(()=>null);
}
function contractBeat(){
  beatAt=simTime;beatAmp=.6+.4*Math.random();
  let failed=false;
  const mk=(ei,type,usd,from,to,fail)=>particles.push({ei,dir:1,t0:simTime+Math.random()*.3,dur:1+Math.random()*.2,type,usd,from,to,blk:0,af:addrOf(from),at:addrOf(to),fail:!!fail,x:-99,y:-99});
  for(let i=0;i<C.flow.dep;i++)mk(0,'buy',Math.round(40+Math.random()*900),'USR','P',false);
  for(let i=0;i<C.flow.wd;i++){const f=Math.random()<C.flow.fail;if(f)failed=true;mk(1,'sell',Math.round(40+Math.random()*900),'P','USR',f);}
  CEDGES.forEach((E,i)=>{if(E.lane==='pow'&&E.power.siphon)mk(i,'siphon',Math.round(300+Math.random()*1200),'P','OWN',false);});
  cBeats.push({t:simTime,amp:beatAmp,fail:failed});
  while(cBeats.length&&simTime-cBeats[0].t>16)cBeats.shift();
  if(particles.length>900)particles.splice(0,particles.length-900);
}

/* ---------- hud / chips / panel ---------- */
function updateHud(){
  if(mode==='token'){
    let likely=0,poss=0;
    ['A','B'].forEach(id=>{const c=cur.conf[id];if(c>=.7)likely+=cur.hold[id];else if(c>0)poss+=cur.hold[id];});
    $('linkedNum').textContent=fmtPct(likely);$('linkedNum').style.color='';
    $('linkedLbl').textContent='held by wallets that look connected';
    $('possNum').textContent=poss>0?`+ ${fmtPct(poss)} maybe connected`:'';
    $('clock').textContent=`Launch +${curB} blocks`;
    const ratio=SIM.pcCum[curB]?SIM.tcCum[curB]/SIM.pcCum[curB]:1;
    $('dotnote').textContent=(ratio>1.05?`1 dot ≈ ${ratio.toFixed(1)} transfers. `:'1 dot = 1 transfer. ')+'The strip shows transactions per block. Drag it to move through time.';
  }else{
    const v=verdictOf(cScore);
    $('linkedNum').textContent=cScore;$('linkedNum').style.color=v.color;
    $('linkedLbl').textContent=v.label;
    $('possNum').textContent='Risk score, 0 to 100';
    $('clock').textContent='Live view · simulated calls';
    $('dotnote').textContent='Each beat is a batch of calls to this contract. Amber ticks mark sells that failed.';
  }
}
function renderChips(){
  if(mode==='token'){
    const fl=cur.flags,sig='t'+fl.map(f=>f.id).join();
    if(sig===chipSig)return;chipSig=sig;
    $('signals').innerHTML=fl.length?fl.map(f=>`<button class="chip" data-id="${f.id}"><i></i>${f.short} · +${f.block}</button>`).join(''):`<span class="none">${started?'No risk signals yet':'Risk signals appear here during the scan'}</span>`;
  }else{
    const sig='c'+C.id;if(sig===chipSig)return;chipSig=sig;
    const items=C.findings.map((f,i)=>({f,i})).filter(x=>x.f.sev==='high'||x.f.sev==='med');
    $('signals').innerHTML=items.length?items.map(x=>`<button class="chip ${x.f.sev}" data-fi="${x.i}"><i></i>${x.f.short}</button>`).join(''):`<span class="none">No major findings</span>`;
  }
}
function fundedBy(id){let n=0,u=0;for(let b=0;b<=curB;b++)for(const t of BLOCKS[b])if(t.from===id&&t.fresh){n+=t.fresh;u+=t.usd;}return {n,u};}
function setPanel(html){
  const p=$('panel'),top=p.scrollTop;
  p.innerHTML=html;p.hidden=false;p.scrollTop=top;
  if(!panelWas){panelWas=true;layout();}
}
function hidePanel(){const p=$('panel');p.hidden=true;if(panelWas){panelWas=false;layout();}}
function renderPanel(){mode==='token'?renderPanelT():renderPanelC();}
function renderPanelT(){
  if(!selected){hidePanel();return;}
  const id=selected,kind=KINDS[id],s=cur,share=s.hold[id];
  let h=`<button id="px" aria-label="Close details">×</button><h2>${NAMES[id]}</h2><p class="kind">${KIND_LABEL[kind]}</p>`;
  if(id==='P'){
    const tb=IDS.reduce((a,k)=>a+s.usdBuy[k],0),ts=IDS.reduce((a,k)=>a+s.usdSell[k],0);
    h+=`<div class="big">${fmtPct(share)}<span>of supply still in the pool</span></div><dl><dt>Bought from the pool</dt><dd>${fmtUsd(tb)}</dd><dt>Paid out to sellers</dt><dd>${fmtUsd(ts)}</dd><dt>Transfers so far</dt><dd>${SIM.tcCum[curB].toLocaleString('en-US')}</dd></dl><p class="note">The heart is the ${'liquidity pool'}. Buys arrive through the vena cava and sells leave through the aorta. It beats once per block.</p>`;
  }else{
    h+=`<div class="big">${fmtPct(share)}<span>of supply</span></div><dl>`;
    h+=`<dt>${kind==='diffuse'?'Holders':'Wallets'}</dt><dd>${s.wallets[id]}</dd>`;
    if(id==='F'){const f=fundedBy('F');if(f.n)h+=`<dt>Sent to new wallets</dt><dd>${f.n} wallets, ${fmtUsd(f.u)}</dd>`;}
    if(s.usdBuy[id]>0)h+=`<dt>Spent buying</dt><dd>${fmtUsd(s.usdBuy[id])}</dd>`;
    if(s.usdSell[id]>0)h+=`<dt>Taken out selling</dt><dd>${fmtUsd(s.usdSell[id])}</dd>`;
    h+=`</dl>`;
    if(kind==='linked'){
      const c=s.conf[id],ev=s.ev[id];
      const lab=c>=.7?'Probably connected':c>0?'Maybe connected':'Not enough signals yet';
      h+=`<div class="conf"><span>${lab}</span><span>${c.toFixed(2)}</span></div><div class="bar"><i style="width:${Math.round(c*100)}%"></i></div>`;
      if(ev.length)h+=`<h3>Why these wallets are grouped</h3><ul>${ev.map(e=>`<li><b>+${e.block}</b><span>${T(e.text)}</span></li>`).join('')}</ul>`;
      h+=`<p class="note">The score adds up the signals seen so far. It is a heuristic, not proof of one owner.</p>`;
    }
  }
  const mine=s.flags.filter(f=>f.clusters.includes(id));
  if(mine.length)h+=`<h3>Risk signals</h3><ul>${mine.map(f=>`<li class="risk"><b>+${f.block}</b><span><strong>${f.title}.</strong> ${T(f.detail)}</span></li>`).join('')}</ul>`;
  setPanel(h);
}
const SEV_LABEL={high:'High',med:'Medium',low:'Low',ok:'Fine',info:'Note'};
function renderPanelC(){
  if(!selected&&!cPanelOpen){hidePanel();return;}
  let h=`<button id="px" aria-label="Close details">×</button>`;
  if(selected&&selected!=='findings'){
    const id=selected;
    if(id==='P'){
      h+=`<h2>${C.name}</h2><p class="kind">${C.kind} · ${C.addr}</p><dl>${C.facts.map(f=>`<dt>${f[0]}</dt><dd>${f[1]}</dd>`).join('')}</dl><p class="note">The heart is the contract. Users send funds in through the vena cava and take them out through the aorta. Vessels leaving toward the admin wallet are the powers the admin holds.</p>`;
    }else if(id==='OWN'){
      h+=`<h2>Admin wallet</h2><p class="kind">${C.owner.label}</p><dl><dt>Activity</dt><dd>${C.owner.last}</dd></dl><h3>What it can do</h3><ul>${C.powers.map(p=>`<li><span class="sev ${p.sev}">${SEV_LABEL[p.sev]}</span><span>${p.label}<small>${p.guard==='none'?'Takes effect immediately, '+p.guardLabel:'Held back by '+p.guardLabel}</small></span></li>`).join('')}</ul>`;
    }else if(id==='USR'){
      const f=C.flow;
      h+=`<h2>Recent users</h2><p class="kind">Wallets that called the contract in the last blocks</p><dl><dt>Deposits and buys</dt><dd>Going through</dd><dt>Sells and withdrawals</dt><dd>${f.fail>0.5?'Almost all fail':'Going through'}</dd></dl>${f.fail>0.5?'<p class="note">Dark marks on the red vessel are sells that reverted in the simulation. Users can put money in but not take it out.</p>':''}`;
    }else if(id==='TOP'){
      h+=`<h2>${C.top.label}</h2><p class="kind">Largest holders of the token</p><div class="big">${C.top.share}%<span>of supply</span></div><p class="note">High concentration means a few wallets can move the price or exit at once.</p>`;
    }
    h+=`<button class="btn" id="pf">All findings</button>`;
  }else{
    const v=verdictOf(cScore);
    const sorted=C.findings.map((f,i)=>({f,i})).sort((a,b)=>SEV_ORDER[a.f.sev]-SEV_ORDER[b.f.sev]);
    h+=`<h2>${C.name}</h2><p class="kind">${C.kind} · ${C.addr}</p><div class="verdict" style="color:${v.color}">${v.action}</div><p class="kind" style="margin-bottom:6px">${T(C.headline)}</p><h3>Everything we found</h3><ul>${sorted.map(x=>`<li class="fl"><button class="fb" data-fi="${x.i}" aria-label="Show this on the map: ${x.f.short}"><span class="sev ${x.f.sev}">${SEV_LABEL[x.f.sev]}</span><span><strong>${T(x.f.plain)}</strong></span></button><details><summary>Technical detail</summary><div><strong>${x.f.title}.</strong> ${T(x.f.detail)}<br><code>${x.f.where}</code></div></details></li>`).join('')}</ul><p class="note">The score combines the findings above. This is simulated sample data. A real scan reads the bytecode and storage, checks the source, and simulates buys and sells, but it can still miss things.</p>`;
  }
  setPanel(h);
}
function updateAll(){updateHud();renderChips();if(mode==='token'?selected:(selected||cPanelOpen))renderPanel();syncPlay();}
function select(id){selected=id;renderPanel();}
function flashPower(fi){
  const f=C.findings[fi];cFlash={power:f.power||null,until:realTime+2.6};
  if(f.power){const p=C.powers.find(x=>x.id===f.power);if(p)toast(f.title);}
}

/* ---------- drawing helpers ---------- */
function epFor(E,pos,Hg){
  let a,b;
  if(E.lane==='in'){a=pos(E.a);b=Hg.inflow;}
  else if(E.lane==='out'){a=Hg.outflow;b=pos(E.b);}
  else if(E.lane==='pow'){a=[Hg.cx-.25*Hg.u,Hg.cy-.1*Hg.u];b=pos(E.b);}
  else{a=pos(E.a);b=pos(E.b);}
  if(E.a==='P'&&E.lane==='plain')a=[Hg.cx,Hg.cy];
  if(E.b==='P'&&E.lane==='plain')b=[Hg.cx,Hg.cy];
  const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1;
  return {ax:a[0],ay:a[1],bx:b[0],by:b[1],cx:(a[0]+b[0])/2-dy/len*E.c*len,cy:(a[1]+b[1])/2+dx/len*E.c*len};
}
function bezAt(P,u){const m=1-u;return [m*m*P.ax+2*m*u*P.cx+u*u*P.bx,m*m*P.ay+2*m*u*P.cy+u*u*P.by];}
function blobPath(x,y,r,ph,amp){
  g.beginPath();const n=40;
  for(let i=0;i<=n;i++){
    const th=i/n*Math.PI*2;
    const k=1+amp*(.06*Math.sin(3*th+ph+realTime*.7)+.04*Math.sin(5*th-ph*1.3-realTime*.5));
    const px=x+Math.cos(th)*r*k,py=y+Math.sin(th)*r*k;
    i?g.lineTo(px,py):g.moveTo(px,py);
  }
  g.closePath();
}
function strokeEdge(P,w,rgb,aOuter,aInner){
  g.beginPath();g.moveTo(P.ax,P.ay);g.quadraticCurveTo(P.cx,P.cy,P.bx,P.by);
  g.strokeStyle=`rgba(${rgb},${aOuter})`;g.lineWidth=w*2.4;g.stroke();
  g.strokeStyle=`rgba(${rgb},${aInner})`;g.lineWidth=Math.max(1,w*.8);g.stroke();
}
function drawParticles(EA,PA,dimFn){
  g.globalCompositeOperation='lighter';
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i],pr=(simTime-p.t0)/p.dur;
    if(pr>1){particles.splice(i,1);continue;}
    if(pr<0)continue;
    const E=EA[p.ei],P=PA[p.ei];if(!E||!P){particles.splice(i,1);continue;}
    const lim=p.fail?.45:1;
    const pp=Math.min(pr,lim);
    const u=p.dir>0?pp:1-pp;
    const [x,y]=bezAt(P,u);p.x=x;p.y=y;
    const dim=dimFn(E);
    let col=p.type==='buy'?VEN:p.type==='sell'?ART:p.type==='siphon'?`rgb(${AMBER})`:`rgb(${BONE})`;
    let alpha=.95*dim;
    if(p.fail&&pr>.45){col='#8a3a34';alpha*=Math.max(0,1-(pr-.45)/.55);}
    const r=Math.min(4.2,1.3+.55*Math.log(1+p.usd/800))*S;
    const [tx2,ty2]=bezAt(P,p.dir>0?Math.max(0,pp-.05):Math.min(1,1-pp+.05));
    g.globalAlpha=alpha*.32;g.strokeStyle=col;g.lineWidth=r*1.2;g.beginPath();g.moveTo(tx2,ty2);g.lineTo(x,y);g.stroke();
    g.globalAlpha=alpha;g.fillStyle=col;g.beginPath();g.arc(x,y,r,0,7);g.fill();
  }
  g.globalAlpha=1;g.globalCompositeOperation='source-over';
  // marks where sells stopped
  for(const p of particles){
    if(!p.fail||(simTime-p.t0)/p.dur<.45)continue;
    const E=EA[p.ei],P=PA[p.ei];if(!E||!P)continue;
    const [x,y]=bezAt(P,.45),a=Math.max(0,1-((simTime-p.t0)/p.dur-.45)/.55);
    g.strokeStyle=`rgba(${AMBER},${a})`;g.lineWidth=1.6;const k=3.5*S;
    g.beginPath();g.moveTo(x-k,y-k);g.lineTo(x+k,y+k);g.moveTo(x+k,y-k);g.lineTo(x-k,y+k);g.stroke();
  }
}
function drawHeartAt(Hg,label,sub,sel){
  const pV=pulseNow(.1),pA=pulseNow(0);
  g.save();
  g.shadowColor='rgba(255,90,69,.55)';g.shadowBlur=(6+30*pV)*S;
  g.globalAlpha=.001;drawHeart(g,Hg.cx,Hg.cy,Hg.u,pV,pA,realTime);g.restore();
  // soft glow behind
  const gl=g.createRadialGradient(Hg.cx,Hg.cy,Hg.u*.2,Hg.cx,Hg.cy,Hg.u*1.7);
  gl.addColorStop(0,`rgba(255,70,60,${.10+.22*pV})`);gl.addColorStop(1,'rgba(255,70,60,0)');
  g.fillStyle=gl;g.fillRect(Hg.cx-Hg.u*2,Hg.cy-Hg.u*2,Hg.u*4,Hg.u*4);
  drawHeart(g,Hg.cx,Hg.cy,Hg.u,pV,pA,realTime);
  if(sel){g.strokeStyle=`rgba(${BONE},.9)`;g.lineWidth=1.8;g.setLineDash([4,4]);g.beginPath();g.ellipse(Hg.cx+.05*Hg.u,Hg.cy-.05*Hg.u,1.2*Hg.u,1.3*Hg.u,0,0,7);g.stroke();g.setLineDash([]);}
  const fs=Math.max(11,12.5*S);
  g.textAlign='center';g.font=`${fs}px ${SANS}`;g.fillStyle=`rgb(${BONE})`;
  g.fillText(label,Hg.cx,Hg.cy+1.12*Hg.u+fs+4);
  if(sub){g.font=`${Math.max(13,15*S)}px ${SERIF}`;g.fillStyle=`rgba(${BONE},.8)`;g.fillText(sub,Hg.cx,Hg.cy+1.12*Hg.u+fs+4+Math.max(15,16*S));}
}
function drawOrgan(d,o){
  // o: {name,sub,kind,dash,alpha,dots,dotAlpha,sel,lit,ring}
  blobPath(d.x,d.y,d.r,d.ph,WOB);
  g.fillStyle='#170a14';g.fill();
  const gr=g.createRadialGradient(d.x-d.r*.3,d.y-d.r*.3,d.r*.1,d.x,d.y,d.r);
  gr.addColorStop(0,`rgba(${BONE},.17)`);gr.addColorStop(1,`rgba(${BONE},.04)`);
  g.fillStyle=gr;g.fill();
  g.setLineDash(o.dash||[]);g.strokeStyle=`rgba(${BONE},${o.sel?1:o.alpha})`;g.lineWidth=o.sel?2.6:1.5;g.stroke();g.setLineDash([]);
  if(o.ring){g.beginPath();g.arc(d.x,d.y,d.r*.55,0,7);g.strokeStyle=`rgba(${BONE},.3)`;g.lineWidth=1;g.stroke();}
  const rot=WOB*realTime*.05;
  for(let i=0;i<o.dots;i++){
    const a=i*2.399+rot,rr=o.dots===1?0:Math.sqrt((i+.5)/o.dots)*d.r*.68;
    const on=o.lit==null||i<o.lit;
    g.fillStyle=`rgba(${BONE},${on?o.dotAlpha:.18})`;
    g.beginPath();g.arc(d.x+Math.cos(a)*rr,d.y+Math.sin(a)*rr,(o.small?1.2:1.9)*S,0,7);g.fill();
  }
  const fs=Math.max(11,12.5*S);
  g.textAlign='center';g.fillStyle=`rgb(${BONE})`;g.font=`${fs}px ${SANS}`;
  const ly=d.y+d.r+fs+4;g.fillText(o.name,d.x,ly);
  if(o.sub){g.font=`${Math.max(12,14*S)}px ${SERIF}`;g.fillStyle=`rgba(${BONE},.8)`;g.fillText(o.sub,d.x,ly+Math.max(15,16*S));}
}
function visible(id){return id==='P'||curB>=(SIM.appear[id]??1e9);}

/* ---------- draw: token mode ---------- */
function drawToken(dt){
  const k=1-Math.exp(-dt*6);
  IDS.forEach(id=>{
    const d=disp[id];
    d.x+=(d.tx-d.x)*k;d.y+=(d.ty-d.y)*k;
    d.share+=(cur.hold[id]-d.share)*k;
    if(id!=='P'){const rt=S*(12+8*Math.sqrt(Math.max(0,d.share)));d.r+=((visible(id)?rt:0)-d.r)*k;}
  });
  const Hg=heartGeom(),pulse=pulseNow(.1);
  const pos=id=>[disp[id].x,disp[id].y];
  EDGES.forEach((E,i)=>EP[i]=epFor(E,pos,Hg));
  g.lineCap='round';
  EDGES.forEach((E,i)=>{
    const vol=cur.edgeVol[E.key];if(!vol)return;
    const act=Math.max(0,1-(curB-(cur.last[E.key]??-99))/6);
    const dim=selected&&selected!=='P'&&E.a!==selected&&E.b!==selected?.3:1;
    const w=S*Math.min(7,(E.lane==='plain'?.9:1.6)+.65*Math.log(1+vol/1000))*(1+.3*pulse);
    const rgb=E.lane==='in'?VEIN_RGB:E.lane==='out'?ART_RGB:BONE;
    strokeEdge(EP[i],w,rgb,(.16+.08*act)*dim,(.38+.4*act)*dim);
  });
  drawParticles(EDGES,EP,E=>selected&&selected!=='P'&&E.a!==selected&&E.b!==selected?.35:1);
  IDS.forEach(id=>{
    if(id==='P'||!visible(id))return;
    const d=disp[id];if(d.r<1)return;
    const kind=KINDS[id],sh=cur.hold[id];
    let dash=[],alpha=.7,dots=0,sub='';
    if(kind==='linked'){const c=cur.conf[id];if(c>=.7)alpha=.95;else{dash=[5*S,4*S];alpha=.8;}dots=Math.min(24,cur.wallets[id]);sub=`${fmtPct(sh)} · ${cur.wallets[id]} wallets`;}
    else if(kind==='diffuse'){dash=[1.5,4];alpha=.6;dots=Math.min(70,Math.round(cur.wallets[id]/5));sub=`${fmtPct(sh)} · ${cur.wallets.R} holders`;}
    else if(kind==='wallet'){dots=1;if(sh>.05)sub=fmtPct(sh);}
    else if(sh>.05)sub=fmtPct(sh);
    drawOrgan(d,{name:NAMES[id],sub,dash,alpha,dots,dotAlpha:kind==='diffuse'?.4:.8,small:kind==='diffuse',sel:selected===id,ring:id==='X'});
  });
  drawHeartAt(Hg,'Liquidity pool',mobile?'':`holds ${fmtPct(cur.hold.P)}`,selected==='P');
  drawFlags();
}
function drawFlags(){
  for(const f of cur.flags){
    const age=curB-f.block,fade=age<25?1:.55,since=simTime-(flagAnim[f.id]??-99);
    const ring=d=>{if(since<1.4){g.strokeStyle=`rgba(${AMBER},${1-since/1.4})`;g.lineWidth=2;g.beginPath();g.arc(d.x,d.y,d.r*(1.2+since*1.6),0,7);g.stroke();}};
    if(f.type==='fan'){
      const d=disp[f.clusters[0]];
      g.strokeStyle=`rgba(${AMBER},${.9*fade})`;g.lineWidth=1.8;
      for(let i=0;i<14;i++){
        const a=i/14*Math.PI*2+WOB*realTime*.15,r0=d.r*1.3,len=(5+3*WOB*Math.sin(realTime*2.2+i))*S;
        g.beginPath();g.moveTo(d.x+Math.cos(a)*r0,d.y+Math.sin(a)*r0);g.lineTo(d.x+Math.cos(a)*(r0+len),d.y+Math.sin(a)*(r0+len));g.stroke();
      }
      ring(d);
    }else if(f.type==='loop'){
      for(let i=0;i<3;i++){
        const hit=EBY[f.clusters[i]+'>'+f.clusters[(i+1)%3]];if(!hit)continue;
        const P=EP[hit.i];
        g.beginPath();g.moveTo(P.ax,P.ay);g.quadraticCurveTo(P.cx,P.cy,P.bx,P.by);
        g.strokeStyle=`rgba(${AMBER},${(.32+.12*WOB*Math.sin(realTime*2+i))*fade})`;g.lineWidth=3.4*S;g.stroke();
        const [mx,my]=bezAt(P,.5);
        g.fillStyle=`rgba(${AMBER},${.95*fade})`;g.beginPath();g.arc(mx,my,3.4*S*(1+.15*WOB*Math.sin(realTime*3+i)),0,7);g.fill();
        g.fillStyle='#170a14';g.beginPath();g.arc(mx,my,1.2*S,0,7);g.fill();
      }
      ring(disp[f.clusters[0]]);
    }else if(f.type==='swell'){
      const d=disp[f.clusters[0]];
      blobPath(d.x,d.y,d.r*(1.26+.03*WOB*Math.sin(realTime*2.4)),d.ph+1,WOB*1.6);
      g.setLineDash([5*S,4*S]);g.strokeStyle=`rgba(${AMBER},${.9*fade})`;g.lineWidth=1.6;g.stroke();g.setLineDash([]);
      ring(d);
    }
  }
}

/* ---------- draw: contract mode ---------- */
function drawContract(dt){
  const k=1-Math.exp(-dt*6);
  ['OWN','USR','TOP'].forEach(id=>{
    const d=cn[id];d.x+=(d.tx-d.x)*k;d.y+=(d.ty-d.y)*k;
    let rt=0;
    if(id==='OWN')rt=S*20;
    else if(id==='USR')rt=S*34;
    else if(id==='TOP'&&C.top)rt=S*(12+8*Math.sqrt(C.top.share));
    d.r+=(rt-d.r)*k;
  });
  disp.P.x+=(disp.P.tx-disp.P.x)*k;disp.P.y+=(disp.P.ty-disp.P.y)*k;
  const Hg=heartGeom(),pulse=pulseNow(.1);
  const pos=id=>id==='P'?[Hg.cx,Hg.cy]:[cn[id].x,cn[id].y];
  CEDGES.forEach((E,i)=>CEP[i]=epFor(E,pos,Hg));
  const flashOn=cFlash&&realTime<cFlash.until;
  g.lineCap='round';
  cChipRects=[];
  CEDGES.forEach((E,i)=>{
    const P=CEP[i];
    if(E.lane==='in')strokeEdge(P,S*(2.4+.5*pulse),VEIN_RGB,.13,.34);
    else if(E.lane==='out')strokeEdge(P,S*(2.4+.5*pulse),ART_RGB,.13,.34);
    else if(E.lane==='plain')strokeEdge(P,S*1.2,BONE,.08,.2);
    else if(E.lane==='pow'){
      const p=E.power,open=p.guard==='none';
      const base=p.sev==='high'?3.6:p.sev==='med'?2.8:1.5;
      const focus=flashOn&&cFlash.power===p.id;
      const dim=flashOn&&!focus?.35:1;
      const rgb=!open?BONE:p.sev==='high'?ART_RGB:AMBER;
      if(!open)g.setLineDash([6*S,5*S]);
      strokeEdge(P,S*base*(focus?1.4:1)*(1+.2*pulse),rgb,(open?.2:.1)*dim,(open?.55:.3)*dim);
      g.setLineDash([]);
      // valve where a guard holds the power back
      if(!open){
        const [vx,vy]=bezAt(P,.16),[wx,wy]=bezAt(P,.2);
        const ang=Math.atan2(wy-vy,wx-vx)+Math.PI/2,kk=6*S;
        g.strokeStyle=`rgba(${BONE},.9)`;g.lineWidth=2;
        for(const o of [-2,2]){g.beginPath();g.moveTo(vx+Math.cos(ang)*kk+o*Math.cos(ang+1.57),vy+Math.sin(ang)*kk+o*Math.sin(ang+1.57));g.lineTo(vx-Math.cos(ang)*kk+o*Math.cos(ang+1.57),vy-Math.sin(ang)*kk+o*Math.sin(ang+1.57));g.stroke();}
      }
      E._chip={p,focus,dim,open};
    }
  });
  drawParticles(CEDGES,CEP,E=>{if(!flashOn||!cFlash.power)return 1;return E.lane==='pow'&&E.power.id===cFlash.power?1:.4;});
  // admin, users, top holders
  const o=C.owner;
  drawOrgan(cn.OWN,{name:'Admin wallet',sub:o.type==='multisig'?'Multisig 3 of 5':'Single wallet',dash:o.type==='multisig'?[5*S,4*S]:[],alpha:.9,dots:o.dots,lit:o.lit,dotAlpha:.9,sel:selected==='OWN'});
  drawOrgan(cn.USR,{name:'Recent users',sub:'',dash:[1.5,4],alpha:.6,dots:30,dotAlpha:.4,small:true,sel:selected==='USR'});
  if(C.top)drawOrgan(cn.TOP,{name:C.top.label,sub:C.top.share+'% of supply',dash:[5*S,4*S],alpha:.85,dots:C.top.dots,dotAlpha:.9,sel:selected==='TOP'});
  drawHeartAt(Hg,C.name,'',selected==='P');
  // power labels sit on top so they stay readable
  g.font=`${Math.max(10.5,11.5*S)}px ${SANS}`;g.textAlign='center';
  CEDGES.forEach((E,i)=>{
    if(E.lane!=='pow')return;
    const {p,focus,dim,open}=E._chip,P=CEP[i];
    const [x,y]=bezAt(P,E.t);
    const text=`${p.label} · ${p.guardLabel}`,w=g.measureText(text).width+14,h=20*Math.max(.9,S);
    const col=open?(p.sev==='high'?ART_RGB:AMBER):BONE;
    g.globalAlpha=dim;
    g.beginPath();g.roundRect?g.roundRect(x-w/2,y-h/2,w,h,h/2):g.rect(x-w/2,y-h/2,w,h);
    g.fillStyle='#170a14';g.fill();g.strokeStyle=`rgba(${col},${focus?1:.75})`;g.lineWidth=focus?2:1.2;g.stroke();
    g.fillStyle=`rgb(${BONE})`;g.fillText(text,x,y+4);
    g.globalAlpha=1;
    cChipRects.push({x:x-w/2,y:y-h/2,w,h,power:p.id});
  });
}

/* ---------- activity strip ---------- */
function drawEcg(){
  const w=ecg.width/DPR,h=ecg.height/DPR;
  ge.setTransform(DPR,0,0,DPR,0,0);ge.clearRect(0,0,w,h);
  const base=h*.58,amp=h*.5;
  ge.lineJoin='round';
  const pts=[[0,0],[.1,0],[.18,.1],[.26,0],[.38,0],[.44,-.15],[.5,1],[.58,-.35],[.66,0],[.82,.2],[.92,0],[1,0]];
  if(mode==='token'){
    const sw=w/N;
    ge.setLineDash([2,4]);ge.strokeStyle=`rgba(${BONE},.2)`;ge.lineWidth=1;
    ge.beginPath();ge.moveTo((curB+1)*sw,base);ge.lineTo(w,base);ge.stroke();ge.setLineDash([]);
    ge.strokeStyle=`rgba(${BONE},.9)`;ge.lineWidth=1.4;ge.beginPath();ge.moveTo(0,base);
    for(let i=0;i<=curB;i++){
      const a=Math.min(1,Math.log(1+SIM.cnt[i])/Math.log(71));
      for(const [px,py] of pts)ge.lineTo((i+px)*sw,base-py*a*amp);
    }
    ge.stroke();
    ge.fillStyle=`rgb(${AMBER})`;
    cur.flags.forEach(f=>{const x=(f.block+.5)*sw;ge.beginPath();ge.moveTo(x-4,1);ge.lineTo(x+4,1);ge.lineTo(x,8);ge.closePath();ge.fill();});
    const px=(curB+blockAcc)*sw;
    ge.strokeStyle=ART;ge.lineWidth=1.5;ge.beginPath();ge.moveTo(px,0);ge.lineTo(px,h);ge.stroke();
  }else{
    const win=14,bw=w/win*.6;
    ge.strokeStyle=`rgba(${BONE},.9)`;ge.lineWidth=1.4;ge.beginPath();ge.moveTo(0,base);
    for(const b of cBeats){
      const x=w-(simTime-b.t)/win*w;if(x<-bw||x>w)continue;
      for(const [px,py] of pts)ge.lineTo(x+px*bw,base-py*b.amp*amp*.9);
    }
    ge.lineTo(w,base);ge.stroke();
    ge.fillStyle=`rgb(${AMBER})`;
    for(const b of cBeats){if(!b.fail)continue;const x=w-(simTime-b.t)/win*w+bw*.5;if(x<0||x>w)continue;ge.beginPath();ge.moveTo(x-4,1);ge.lineTo(x+4,1);ge.lineTo(x,8);ge.closePath();ge.fill();}
    ge.strokeStyle=ART;ge.lineWidth=1.5;ge.beginPath();ge.moveTo(w-1,0);ge.lineTo(w-1,h);ge.stroke();
  }
}

/* ---------- interaction ---------- */
function inHeart(x,y){const Hg=heartGeom();const dx=(x-Hg.cx-.05*Hg.u)/(1.05*Hg.u),dy=(y-Hg.cy+.1*Hg.u)/(1.25*Hg.u);return dx*dx+dy*dy<1;}
function organAt(x,y){
  if(inHeart(x,y))return 'P';
  if(mode==='token'){
    for(let i=IDS.length-1;i>=0;i--){const id=IDS[i];if(id==='P'||!visible(id))continue;const d=disp[id];if(Math.hypot(x-d.x,y-d.y)<d.r+6)return id;}
  }else{
    for(const id of ['OWN','USR','TOP']){if(id==='TOP'&&!C.top)continue;const d=cn[id];if(Math.hypot(x-d.x,y-d.y)<d.r+6)return id;}
  }
  return null;
}
function chipAt(x,y){if(mode!=='contract')return null;for(const r of cChipRects)if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h)return r;return null;}
function particleAt(x,y){
  let best=null,bd=14;
  for(const p of particles){if(simTime<p.t0)continue;const dd=Math.hypot(x-p.x,y-p.y);if(dd<bd){bd=dd;best=p;}}
  return best;
}
const TYPE_LABEL={buy:'Buy',sell:'Sell',transfer:'Transfer',siphon:'Taken by the admin'};
function showTip(p,x,y,ms){
  const t=$('tip');
  const fail=p.fail?'<br><span style="color:var(--amber)">This sell reverted</span>':'';
  t.innerHTML=`<b>${TYPE_LABEL[p.type]}${mode==='token'?' · block +'+p.blk:''}</b><br>${p.af} → ${p.at}<br>${nameOf(p.from)} → ${nameOf(p.to)}<br>${fmtUsd(p.usd)} USDC <span style="color:var(--mute)">· simulated</span>${fail}`;
  t.style.display='block';
  const tw=t.offsetWidth,th=t.offsetHeight;
  t.style.left=Math.max(8,Math.min(W-tw-8,x+14))+'px';
  t.style.top=Math.max(8,Math.min(H-th-8,y-th-10))+'px';
  tipUntil=ms?performance.now()+ms:0;
}
function hideTip(){$('tip').style.display='none';tipUntil=0;}
function pointerXY(e){const r=stage.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];}
stage.addEventListener('pointermove',e=>{
  if(e.pointerType!=='mouse')return;
  const [x,y]=pointerXY(e);
  const o=organAt(x,y)||chipAt(x,y);stage.style.cursor=o?'pointer':'default';
  if(o){hideTip();return;}
  const p=particleAt(x,y);p?showTip(p,x,y,0):hideTip();
});
stage.addEventListener('pointerleave',()=>hideTip());
stage.addEventListener('pointerdown',e=>{
  const [x,y]=pointerXY(e);
  const ch=chipAt(x,y);
  if(ch){const fi=C.findings.findIndex(f=>f.power===ch.power);if(fi>=0)flashPower(fi);cPanelOpen=true;selected='findings';renderPanel();return;}
  const o=organAt(x,y);
  if(o){hideTip();if(mode==='contract'&&selected===o){selected=null;renderPanel();}else select(o);return;}
  const p=particleAt(x,y);
  if(p){showTip(p,x,y,e.pointerType==='mouse'?0:2600);return;}
  if(selected){selected=null;renderPanel();}
});
$('panel').addEventListener('click',e=>{
  if(e.target.id==='px'){selected=null;cPanelOpen=false;renderPanel();if(mode==='contract')hidePanel();return;}
  if(e.target.id==='pf'){selected=null;renderPanel();return;}
  const b=e.target.closest('button[data-fi]');if(b&&mode==='contract')flashPower(+b.dataset.fi);
});
$('signals').addEventListener('click',e=>{
  const b=e.target.closest('.chip');if(!b)return;
  if(mode==='contract'){flashPower(+b.dataset.fi);cPanelOpen=true;selected=null;renderPanel();return;}
  const f=cur.flags.find(x=>x.id===b.dataset.id);if(!f)return;
  pause();seek(f.block);flagAnim[f.id]=simTime;select(f.clusters[0]);
});
$('play').addEventListener('click',()=>{playing?pause():play();});
$('speed').addEventListener('click',()=>{speed=speed===1?2:speed===2?4:1;$('speed').textContent=speed+'×';});
$('keybtn').addEventListener('click',()=>{$('key').hidden=!$('key').hidden;});
$('findbtn').addEventListener('click',()=>{cPanelOpen=!cPanelOpen;if(!cPanelOpen)selected=null;renderPanel();if(!cPanelOpen)hidePanel();});
$('newscan').addEventListener('click',()=>{pause();$('gate').hidden=false;});
function scrubTo(e){const r=ecg.getBoundingClientRect();pause();seek(Math.floor((e.clientX-r.left)/r.width*N));}
ecg.addEventListener('pointerdown',e=>{if(!started||mode!=='token')return;scrubbing=true;ecg.setPointerCapture(e.pointerId);scrubTo(e);});
ecg.addEventListener('pointermove',e=>{if(scrubbing)scrubTo(e);});
ecg.addEventListener('pointerup',()=>{scrubbing=false;});
ecg.addEventListener('pointercancel',()=>{scrubbing=false;});
window.addEventListener('keydown',e=>{
  if(e.code==='Space'&&started&&mode==='token'&&e.target.tagName!=='INPUT'&&$('gate').hidden){e.preventDefault();playing?pause():play();}
});
let toastT=0;
function toast(msg){const t=$('toast');t.textContent=msg;t.style.opacity=1;clearTimeout(toastT);toastT=setTimeout(()=>t.style.opacity=0,2400);}


/* ---------- simple view ---------- */
let summaryAuto=false;
const SEV_COL={ok:'#4fb5e6',med:'#f5b83d',high:'#ff5a45'};
function tokenSummary(){
  let peak=0;
  for(let i=0;i<=curB;i++){const st=STATES[i];let v=0;['A','B'].forEach(id=>{if(st.conf[id]>=.7)v+=st.hold[id];});if(v>peak)peak=v;}
  const exit=cur.ev.A.some(e=>e.key==='exit');
  const level=exit?'high':peak>=8?'med':'ok';
  const reasons=[];
  if(exit)reasons.push({sev:'high',plain:'The group then sold into the pool and sent money to an exchange. Buyers who arrive later can be left holding the token.'});
  if(peak>=8)reasons.push({sev:level==='high'?'high':'med',plain:`A group of connected wallets held up to ${Math.round(peak)}% of the supply${exit?'':' so far'}. If they sell, the price can fall fast.`});
  const PL={fan:'One wallet created fresh wallets and sent each the same amount. That is a common way to make one buyer look like many.',loop:'Money went round in a circle between three wallets, which can make a token look busier than it really is.',swell:'One group\'s share of the token jumped within a few blocks, a sign of a coordinated early buy.'};
  cur.flags.forEach(f=>reasons.push({sev:'med',plain:PL[f.type]}));
  if(!reasons.length)reasons.push({sev:'ok',plain:`Nothing unusual in the first ${curB} blocks.`});
  return {
    action:level==='high'?'Avoid this one':level==='med'?'Be careful':'Looks okay so far',
    color:SEV_COL[level],
    headline:level==='high'?'Wallets that were linked to each other bought early, then cashed out.':level==='med'?'A group of connected wallets holds a big slice of this token.':'No group of connected wallets stands out so far.',
    whyTitle:level==='ok'?'What we found':'Why',
    reasons:reasons.slice(0,3),
    note:`Based on the first ${curB} blocks after launch. Wallet links are a best guess, and no scan can prove something is safe. Simulated sample data.`
  };
}
function contractSummary(){
  const v=verdictOf(cScore);
  const list=C.findings.slice();
  const good=cScore<20;
  const pick=good?list.filter(f=>f.sev==='ok'):list.filter(f=>f.sev!=='ok'&&f.sev!=='info').sort((a,b)=>SEV_ORDER[a.sev]-SEV_ORDER[b.sev]);
  return {action:v.action,color:v.color,headline:C.headline,whyTitle:good?'What looks good':'Why',
    reasons:pick.slice(0,3).map(f=>({sev:f.sev,plain:f.plain})),
    note:'No scan can prove something is safe, so keep amounts you cannot afford to lose out of anything you are unsure about. Simulated sample data.'};
}
function openSimple(){
  const d=mode==='token'?tokenSummary():contractSummary();
  $('sAct').textContent=d.action;$('sAct').style.color=d.color;
  $('sHead').innerHTML=T(d.headline);
  $('sWhyT').textContent=d.whyTitle;
  $('sWhy').innerHTML=d.reasons.map(r=>`<li><span class="sev ${r.sev}">${SEV_LABEL[r.sev]}</span><span>${T(r.plain)}</span></li>`).join('');
  $('sNote').textContent=d.note;
  $('sAll').textContent=mode==='contract'?'See all findings':'See the details';
  $('simple').hidden=false;$('sShow').focus();
}
function closeSimple(){$('simple').hidden=true;$('gloss').hidden=true;}
$('sumbtn').addEventListener('click',()=>{if(mode==='token')pause();openSimple();});
$('sShow').addEventListener('click',()=>{closeSimple();if(!tourSeen[mode])startTour();});
$('sAll').addEventListener('click',()=>{closeSimple();if(mode==='contract'){cPanelOpen=true;selected=null;renderPanel();}else select('A');});
$('simple').addEventListener('click',e=>{if(e.target.id==='simple')closeSimple();});

/* ---------- guided tour ---------- */
let tour=null;const tourSeen={token:false,contract:false};
const hr=()=>heartGeom();
const TOURS={
 token:[
  {t:'This heart is the token\'s pool of money. It beats once every time Arc adds a new block.',ring:()=>{const h=hr();return {x:h.cx,y:h.cy,r:1.35*h.u};}},
  {t:'Money coming in through this blue vein is people buying the token.',ring:()=>{const h=hr();return {x:h.inflow[0],y:h.inflow[1],r:30*S};}},
  {t:'Money leaving through this red artery is people selling.',ring:()=>{const h=hr();return {x:h.outflow[0],y:h.outflow[1],r:30*S};}},
  {t:'Each bubble is a group of wallets and each dot is one wallet. Wallets funded by the same source that act in step are grouped, because they may belong to one person.',ring:()=>{const d=disp.A;return {x:d.x,y:d.y,r:d.r*1.6+8};}},
  {t:'Amber means a warning sign. Tap one to jump to the moment it happened and see the evidence.',dom:'#signals .chip'},
  {t:'Press Play to watch the launch unfold, or drag the strip at the bottom to move through time.',dom:'#play'}
 ],
 contract:[
  {t:'This heart is the contract, a program that holds and moves people\'s money. It beats each time people use it.',ring:()=>{const h=hr();return {x:h.cx,y:h.cy,r:1.35*h.u};}},
  {t:'This is the admin wallet: the person or group who controls the contract.',ring:()=>{const d=cn.OWN;return {x:d.x,y:d.y,r:d.r*1.7+8};}},
  {t:'Each vessel to the admin is something they are allowed to do. Red or amber means they can do it right away. Dashed with a valve means something holds them back.',ring:()=>{const r=cChipRects[0];return r?{x:r.x+r.w/2,y:r.y+r.h/2,r:Math.max(r.w,60)*.65}:null;}},
  {t:'Blue is people putting money in and red is people taking it out. A cross on the red vessel is a sell that failed.',ring:()=>{const d=cn.USR;return {x:d.x,y:d.y,r:d.r*1.6+8};}},
  {t:'The score and verdict summarise everything. Tap Findings for each reason in plain words.',dom:'#linked'}
 ]
};
let spotEl=null;
function clearSpot(){if(spotEl){spotEl.classList.remove('spot');spotEl=null;}}
function showTourStep(){
  const st=tour.steps[tour.i];
  $('tText').innerHTML=T(st.t);
  $('tStep').textContent=`${tour.i+1} of ${tour.steps.length}`;
  $('tBack').hidden=tour.i===0;
  $('tNext').textContent=tour.i===tour.steps.length-1?'Done':'Next';
  clearSpot();
  if(st.dom){const el=document.querySelector(st.dom);if(el){el.classList.add('spot');spotEl=el;}}
  $('tour').hidden=false;
}
function startTour(){
  closeMore();closeSimple();selected=null;
  if(mode==='token'){pause();if(curB<34)seek(34);}
  hidePanel();
  tour={i:0,steps:TOURS[mode]};showTourStep();
}
function endTour(done){
  clearSpot();$('tour').hidden=true;tour=null;tourSeen[mode]=true;
  if(done&&mode==='token')toast('Press Play to watch the launch');
  if(mode==='contract'&&cPanelOpen)renderPanel();
}
$('tNext').addEventListener('click',()=>{if(tour.i>=tour.steps.length-1)endTour(true);else{tour.i++;showTourStep();}});
$('tBack').addEventListener('click',()=>{if(tour.i>0){tour.i--;showTourStep();}});
$('tSkip').addEventListener('click',()=>endTour(false));
$('tourbtn').addEventListener('click',()=>{closeMore();startTour();});
$('morebtn').addEventListener('click',()=>{const open=$('more').hidden;$('more').hidden=!open;$('morebtn').setAttribute('aria-expanded',String(open));});
$('more').addEventListener('click',()=>closeMore());
function drawTourRing(){
  if(!tour)return;
  const st=tour.steps[tour.i];if(!st.ring)return;
  const r=st.ring();if(!r)return;
  g.save();g.strokeStyle=`rgba(${BONE},.95)`;g.lineWidth=2;g.setLineDash([6,5]);g.lineDashOffset=-realTime*12*WOB;
  g.beginPath();g.arc(r.x,r.y,r.r*(1+.05*WOB*Math.sin(realTime*4)),0,7);g.stroke();g.restore();
}

/* ---------- gate ---------- */
let sampleId=CONTRACTS[1].id;
function renderSamples(){
  $('samples').innerHTML=CONTRACTS.map(c=>`<button class="sample" data-id="${c.id}" aria-pressed="${c.id===sampleId}">${c.name}<span>${c.kind} · ${c.addr}</span></button>`).join('');
}
$('samples').addEventListener('click',e=>{const b=e.target.closest('.sample');if(!b)return;sampleId=b.dataset.id;renderSamples();});
function tab(which){
  const t=which==='token';
  $('tabT').setAttribute('aria-selected',t);$('tabC').setAttribute('aria-selected',!t);
  $('paneT').hidden=!t;$('paneC').hidden=t;
}
$('tabT').addEventListener('click',()=>tab('token'));
$('tabC').addEventListener('click',()=>tab('contract'));
function setModeUI(){
  const t=mode==='token';
  $('play').hidden=!t;$('speed').hidden=!t;$('findbtn').hidden=t;
  ecg.style.cursor=t?'ew-resize':'default';
  $('tokname').textContent=t?'ORBT':C.name;
  $('subline').textContent=t?'Sample token on Arc · simulated data':`Sample contract on Arc · ${C.addr} · simulated`;
  renderKey();
}

/* ---------- account: sign in, balance and payment (all simulated in this prototype) ---------- */
const COST=.001;
const esc=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const blankAcct=()=>({signedIn:false,method:null,addr:'',email:'',balance:0,pack:0});
let acct=blankAcct(),pendingRun=null,aTimer=0,aStep='choose',aEmail='';
const bal3=x=>x.toFixed(3);
function updateAcctUI(){$('gateAcct').textContent=acct.signedIn?acct.addr+' · '+bal3(acct.balance):'Connect';}
function openAuth(step){aStep=step;$('auth').hidden=false;renderAuth();setTimeout(()=>{const f=$('aBody').querySelector('input,button');if(f)f.focus();},30);}
function closeAuth(){clearTimeout(aTimer);$('auth').hidden=true;pendingRun=null;}
function spin(msg,next,ms){
  $('aBody').innerHTML='<h2 id="aT">'+msg+'</h2><p><span class="spin"></span>This is simulated, nothing real is happening.</p>';
  clearTimeout(aTimer);aTimer=setTimeout(next,ms||900);
}
function charge(){
  acct.balance=Math.round((acct.balance-COST)*1e6)/1e6;
  if(acct.method==='wallet')acct.pack=Math.max(0,acct.pack-1);
  updateAcctUI();toast('Paid 0.001 USDC · balance '+bal3(acct.balance));
}
function requirePay(run){
  pendingRun=run;
  if(window.PULSE_CONFIG?.payments==='stripe'){
    startStripeCheckout();
    return;
  }
  if(!acct.signedIn){openAuth('choose');return;}
  continuePending();
}
async function startStripeCheckout(){
  const button=mode==='token'?$('scan'):$('scanC');
  button.disabled=true;
  button.textContent='Opening secure checkout…';
  try{
    const response=await fetch((window.PULSE_CONFIG?.apiBase||'')+'/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:'pulse-scan'})});
    const data=await response.json();
    if(!response.ok||!data.url)throw new Error(data.error||'checkout_unavailable');
    window.location.assign(data.url);
  }catch(error){
    console.error('[v0] Unable to start Stripe checkout',error);
    toast('Checkout is unavailable right now. Please try again.');
    button.disabled=false;
    button.textContent='Scan for 0.001 USDC';
    pendingRun=null;
  }
}
function continuePending(){
  if(!pendingRun){aStep='ready';renderAuth();return;}
  if(acct.balance<COST-1e-9){openAuth('fund');return;}
  if(acct.method==='wallet'&&acct.pack<=0){openAuth('approve');return;}
  const run=pendingRun;pendingRun=null;$('auth').hidden=true;charge();run();
}
function afterSignIn(){
  updateAcctUI();
  if(pendingRun){continuePending();return;}
  aStep=acct.balance>=COST?'ready':'fund';renderAuth();
}
function renderAuth(){
  const b=$('aBody'),fine='<p class="fine">Prototype: nothing here is real. Sign-in, wallets, balances and payments are simulated.</p>';
  const left=Math.floor(acct.balance/COST+1e-9);
  if(aStep==='choose'){
    b.innerHTML='<h2 id="aT">Sign in to scan</h2><p>A scan costs 0.001 USDC, paid from a small balance on Arc. Looking at results costs nothing.</p>'+
    '<button class="opt" data-a="wallet"><strong>Connect a wallet</strong><span>Use a wallet you already have. Your keys stay with you.</span></button>'+
    '<button class="opt" data-a="email"><strong>Continue with email</strong><span>No crypto experience needed. A USDC wallet on Arc is created for you through Circle. Keep the balance small, it is meant for scan credit rather than savings.</span></button>'+fine;
  }else if(aStep==='wallet'){
    b.innerHTML='<h2 id="aT">Connect a wallet</h2><p>Choose where your wallet lives.</p>'+
    '<button class="opt" data-a="pick" data-w="Browser wallet"><strong>Browser wallet</strong><span>A wallet extension in this browser.</span></button>'+
    '<button class="opt" data-a="pick" data-w="Phone wallet"><strong>Phone wallet</strong><span>Scan a code with a wallet app on your phone.</span></button>'+
    '<button class="btn full" data-a="back">Back</button>';
  }else if(aStep==='email'){
    b.innerHTML='<h2 id="aT">Continue with email</h2><p>We will send a code to confirm it is you.</p><input id="aEmail" type="email" autocomplete="email" placeholder="you@example.com" aria-label="Email address" value="'+esc(aEmail)+'"><button class="btn primary full" data-a="send">Send code</button><button class="btn full" data-a="back">Back</button>';
  }else if(aStep==='code'){
    b.innerHTML='<h2 id="aT">Enter the code</h2><p>We sent a 6-digit code to '+esc(aEmail)+'. In this prototype any code works.</p><input id="aCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" aria-label="Six digit code"><button class="btn primary full" data-a="create">Create my wallet</button><button class="btn full" data-a="email">Back</button>';
  }else if(aStep==='fund'){
    const opt=v=>'<button class="opt" data-a="fund" data-v="'+v+'"><strong>'+v+'</strong><span>about '+Math.round(v/COST)+' scans</span></button>';
    b.innerHTML='<h2 id="aT">Add USDC for scans</h2><p>'+(acct.method==='email'?'Your wallet is ready. ':'')+'Deposit once into Circle Gateway. Each scan then takes 0.001 USDC from your balance with no network fee.</p><div class="amts">'+opt('0.25')+opt('1')+opt('5')+'</div><p class="fine">Your address: '+acct.addr+'</p>'+fine;
  }else if(aStep==='approve'){
    b.innerHTML='<h2 id="aT">Approve scans</h2><p>Your wallet signs a message for each scan. It costs no network fee, but to avoid a prompt every time you can approve a pack.</p>'+
    '<button class="opt" data-a="approve" data-n="100"><strong>Approve 100 scans</strong><span>Up to 0.100 USDC. You can stop at any time.</span></button>'+
    '<button class="opt" data-a="approve" data-n="1"><strong>Just this scan</strong><span>You will be asked again next time.</span></button>';
  }else{
    b.innerHTML='<h2 id="aT">Your account</h2><dl><dt>Signed in with</dt><dd>'+(acct.method==='email'?'Email':'Wallet')+'</dd><dt>Address</dt><dd>'+acct.addr+'</dd><dt>Balance</dt><dd>'+bal3(acct.balance)+' USDC</dd><dt>Scans left</dt><dd>'+left+'</dd>'+(acct.method==='wallet'?'<dt>Pre-approved scans</dt><dd>'+acct.pack+'</dd>':'')+'</dl><button class="btn primary full" data-a="addfunds">Add funds</button><button class="btn full" data-a="signout">Sign out</button>'+fine;
  }
}
$('aBody').addEventListener('click',e=>{
  const t=e.target.closest('[data-a]');if(!t)return;
  const a=t.dataset.a;
  if(a==='wallet'||a==='email'){aStep=a;renderAuth();}
  else if(a==='back'){aStep='choose';renderAuth();}
  else if(a==='pick'){spin('Connecting your '+t.dataset.w.toLowerCase(),()=>{acct=Object.assign(blankAcct(),{signedIn:true,method:'wallet',addr:'0x7f3a…c91e'});afterSignIn();},900);}
  else if(a==='send'){
    const v=($('aEmail').value||'').trim();
    if(!/^\S+@\S+\.\S+$/.test(v)){toast('Enter a valid email address');$('aEmail').focus();return;}
    aEmail=v;aStep='code';renderAuth();$('aCode').focus();
  }
  else if(a==='create'){spin('Creating your wallet on Arc',()=>{acct=Object.assign(blankAcct(),{signedIn:true,method:'email',addr:'0x2b9e…40d7',email:aEmail});afterSignIn();},1100);}
  else if(a==='fund'){const v=parseFloat(t.dataset.v);spin('Waiting for your deposit',()=>{acct.balance=Math.round((acct.balance+v)*1e6)/1e6;updateAcctUI();continuePending();},1100);}
  else if(a==='approve'){const n=parseInt(t.dataset.n,10);spin('Waiting for your signature',()=>{acct.pack=n;continuePending();},800);}
  else if(a==='addfunds'){aStep='fund';renderAuth();}
  else if(a==='signout'){acct=blankAcct();updateAcctUI();closeAuth();}
});
$('ax').addEventListener('click',closeAuth);
$('auth').addEventListener('click',e=>{if(e.target===$('auth'))closeAuth();});
$('gateAcct').addEventListener('click',()=>{pendingRun=null;openAuth(acct.signedIn?'ready':'choose');});
$('acctbtn').addEventListener('click',()=>{closeMore();pendingRun=null;openAuth(acct.signedIn?'ready':'choose');});
updateAcctUI();
$('scan').addEventListener('click',()=>requirePay(()=>{
  $('gate').hidden=true;mode='token';started=true;chipSig='';selected=null;
  setModeUI();
  summaryAuto=false;seek(0);
  if(!tourSeen.token)startTour();else play();
}));
$('scanC').addEventListener('click',()=>requirePay(()=>{
  $('gate').hidden=true;mode='contract';started=true;pause();chipSig='';
  setupContract(CONTRACTS.find(c=>c.id===sampleId));
  cPanelOpen=!mobile;selected=null;
  setModeUI();
  hidePanel();updateAll();cPanelOpen=false;openSimple();
}));
function renderKey(){
  const sw=(bg,border)=>`<span class="sw" style="${bg?'background:'+bg:''}${border?';border:1.5px '+border:''}"></span>`;
  $('key').innerHTML=mode==='token'?`
<p>${sw('#a3203a')}<span>Heart: the liquidity pool. One beat is one block.</span></p>
<p>${sw('#3d5f9e')}<span>Blue vessels are veins: buys flowing into the pool.</span></p>
<p>${sw('#a3222f')}<span>Red vessels are arteries: sells flowing out of the pool.</span></p>
<p>${sw('',`solid rgb(${BONE})`)}<span>Wallet groups. Size is share of supply, dots are wallets. Dashed means maybe connected.</span></p>
<p>${sw(`rgb(${BONE})`)}<span>Pale vessels: transfers between wallets. Thicker means more USDC.</span></p>
<p>${sw(`rgb(${AMBER})`)}<span>Amber: a risk signal, with the evidence behind it.</span></p>`:`
<p>${sw('#a3203a')}<span>Heart: the contract. It beats with each batch of calls.</span></p>
<p>${sw('#3d5f9e')}<span>Blue: users putting funds in. Red: users taking funds out.</span></p>
<p>${sw('#ff5a45')}<span>Red or amber vessels to the admin wallet: powers it can use right away.</span></p>
<p>${sw('',`dashed rgb(${BONE})`)}<span>Dashed vessel with a valve: a power held back by a timelock or cap.</span></p>
<p>${sw('#8a3a34')}<span>A cross on the red vessel: a sell that reverted.</span></p>`;
}
renderSamples();renderKey();
$('key').hidden=true;

/* ---------- loop ---------- */
let lastT=performance.now();
function frame(now){
  const dt=Math.min(.05,(now-lastT)/1000);lastT=now;
  if(window.__landingOpen){requestAnimationFrame(frame);return;}
  realTime+=dt;
  if(mode==='token'){
    if(playing){
      simTime+=dt*speed;
      if(curB<N-1){
        blockAcc+=dt*speed/BLOCK_S;
        while(blockAcc>=1&&curB<N-1){blockAcc-=1;curB++;onBlock(curB);}
        if(curB>=N-1){blockAcc=0;tail=1.3;}
      }else{tail-=dt*speed;if(tail<=0){playing=false;syncPlay();if(!summaryAuto){summaryAuto=true;openSimple();}}}
    }
  }else if(C){
    simTime+=dt;
    if(simTime>=cNext){contractBeat();cNext=simTime+C.beat.every*(1+(Math.random()*2-1)*C.beat.jitter);}
  }
  if(tipUntil&&performance.now()>tipUntil)hideTip();
  g.setTransform(DPR,0,0,DPR,0,0);g.clearRect(0,0,W,H);
  if(mode==='token'||!C)drawToken(dt);else drawContract(dt);
  drawTourRing();
  drawEcg();
  requestAnimationFrame(frame);
}
addEventListener('resize',resize);
resize();updateAll();
requestAnimationFrame(frame);
// test hook
window.__arc={signIn:(m)=>{acct=Object.assign(blankAcct(),{signedIn:true,method:m||'wallet',addr:'0x7f3a…c91e',balance:.5,pack:100});updateAcctUI();},acct:()=>acct,start:(m,id)=>{if(m==='token')$('scan').click();else{sampleId=id||sampleId;$('scanC').click();}},seek:b=>{pause();seek(b);},select:id=>{select(id);},state:()=>({mode,curB,playing})};
})();
