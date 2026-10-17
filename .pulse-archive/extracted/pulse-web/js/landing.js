//#LANDING_START
(function(){
const $=id=>document.getElementById(id);
const L=$('landing');
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
const BONE='234,223,206',ART_RGB='224,87,74',VEIN_RGB='111,150,214',AMBER='245,184,61';
window.__landingOpen=true;

/* open / close */
function openL(){L.hidden=false;L.scrollTop=0;window.__landingOpen=true;}
function closeL(){L.hidden=true;window.__landingOpen=false;}
window.__landing={open:openL,close:closeL};
L.addEventListener('click',e=>{
  const b=e.target.closest('[data-go]');if(!b)return;
  const go=b.dataset.go;
  if(go==='scan')closeL();
  else if(go.charAt(0)==='#'){const t=document.querySelector(go);if(t)t.scrollIntoView({behavior:RM?'auto':'smooth',block:'start'});}
});
const about=$('aboutbtn');
if(about)about.addEventListener('click',()=>{$('more').hidden=true;openL();});

/* reveal on scroll */
const rv=[...L.querySelectorAll('.rv')];
if('IntersectionObserver' in window&&!RM){
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}}),{root:L,threshold:.12});
  rv.forEach(el=>io.observe(el));
}else rv.forEach(el=>el.classList.add('in'));

/* ---- heart scenes ---- */
const pc=dt=>dt<0?0:Math.exp(-dt*9)+(dt>.2?.55*Math.exp(-(dt-.2)*10):0);
const ctrl=(a,b,k)=>[(a[0]+b[0])/2-(b[1]-a[1])*k,(a[1]+b[1])/2+(b[0]-a[0])*k];
const bez=(a,c,b,u)=>{const m=1-u;return [m*m*a[0]+2*m*u*c[0]+u*u*b[0],m*m*a[1]+2*m*u*c[1]+u*u*b[1]];};
function vessel(g,a,b,k,rgb,w,alpha){
  const c=ctrl(a,b,k);
  g.beginPath();g.moveTo(a[0],a[1]);g.quadraticCurveTo(c[0],c[1],b[0],b[1]);
  g.lineCap='round';
  g.strokeStyle=`rgba(${rgb},${.16*alpha})`;g.lineWidth=w*2.6;g.stroke();
  g.strokeStyle=`rgba(${rgb},${.55*alpha})`;g.lineWidth=w*.9;g.stroke();
  return c;
}
function dots(g,a,c,b,t,col,s,alpha,n){
  for(let k=0;k<n;k++){
    const p=RM?(k+.5)/n:((t*.42+k/n)%1);
    const [x,y]=bez(a,c,b,p);
    const f=Math.sin(p*Math.PI);
    g.globalAlpha=alpha*(.25+.75*f);g.fillStyle=col;g.beginPath();g.arc(x,y,3.2*s,0,7);g.fill();
  }
  g.globalAlpha=1;
}
function blob(g,x,y,r,ph,t){
  g.beginPath();
  for(let i=0;i<=40;i++){
    const th=i/40*Math.PI*2,k=1+(RM?0:1)*(.06*Math.sin(3*th+ph+t*.7)+.04*Math.sin(5*th-ph*1.3-t*.5));
    const px=x+Math.cos(th)*r*k,py=y+Math.sin(th)*r*k;i?g.lineTo(px,py):g.moveTo(px,py);
  }
  g.closePath();
}
function organ(g,x,y,r,o,t){
  blob(g,x,y,r,o.ph||0,t);g.fillStyle='#170a14';g.fill();
  const gr=g.createRadialGradient(x-r*.3,y-r*.3,r*.1,x,y,r);
  gr.addColorStop(0,`rgba(${BONE},.17)`);gr.addColorStop(1,`rgba(${BONE},.04)`);g.fillStyle=gr;g.fill();
  g.setLineDash(o.dash||[]);g.strokeStyle=`rgba(${BONE},.85)`;g.lineWidth=1.6;g.stroke();g.setLineDash([]);
  for(let i=0;i<o.dots;i++){
    const a=i*2.399,rr=o.dots===1?0:Math.sqrt((i+.5)/o.dots)*r*.66;
    g.fillStyle=`rgba(${BONE},.85)`;g.beginPath();g.arc(x+Math.cos(a)*rr,y+Math.sin(a)*rr,Math.max(1.6,r*.055),0,7);g.fill();
  }
}
function setup(canvas){
  const dpr=Math.min(2,window.devicePixelRatio||1);
  const w=canvas.clientWidth,h=canvas.clientHeight;
  if(!w||!h)return null;
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  const g=canvas.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
  return {g,w,h};
}
function drawHero(canvas,t){
  const s=setup(canvas);if(!s)return;const {g,w,h}=s;
  const u=.245*w,cx=w*.5,cy=h*.6;
  const ph=RM?0:t%1,pV=.85*pc(ph-.1),pA=.85*pc(ph);
  const inflow=[cx+HEART_PORTS.inflow[0]*u,cy+HEART_PORTS.inflow[1]*u],outflow=[cx+HEART_PORTS.outflow[0]*u,cy+HEART_PORTS.outflow[1]*u];
  const va=[w*.05,h*.2],ra=[w*.95,h*.2],sc=w/560;
  const vc=vessel(g,va,inflow,.22,VEIN_RGB,3*sc,1),rc=vessel(g,outflow,ra,-.2,ART_RGB,3*sc,1);
  dots(g,va,vc,inflow,t,'#4fb5e6',sc,1,6);dots(g,outflow,rc,ra,t,'#ff5a45',sc,1,6);
  const gl=g.createRadialGradient(cx,cy,u*.2,cx,cy,u*1.8);
  gl.addColorStop(0,`rgba(255,70,60,${.1+.22*pV})`);gl.addColorStop(1,'rgba(255,70,60,0)');
  g.fillStyle=gl;g.fillRect(0,0,w,h);
  drawHeart(g,cx,cy,u,pV,pA,t);
  // annotations
  const fs=Math.max(12,w*.026);
  g.font=`${fs}px ${getComputedStyle(document.body).fontFamily}`;g.fillStyle=`rgb(${BONE})`;g.strokeStyle=`rgba(${BONE},.55)`;g.lineWidth=1;
  const note=(x,y,tx,ty,text,al)=>{g.beginPath();g.moveTo(x,y);g.lineTo(tx,ty);g.stroke();g.beginPath();g.arc(x,y,2.5,0,7);g.fillStyle=`rgb(${BONE})`;g.fill();g.textAlign=al;g.fillText(text,tx+(al==='left'?6:-6),ty+4);};
  const m1=bez(va,vc,inflow,.5),m2=bez(outflow,rc,ra,.55);
  note(m1[0],m1[1],w*.03,h*.09,'Blue: money coming in','left');
  note(m2[0],m2[1],w*.97,h*.09,'Red: money going out','right');
  note(cx+.9*u,cy+.6*u,w*.97,h*.94,'One beat for every Arc block','right');
}
const PARTS=[
 ['heart','The heart','The token\'s pool of money, or the contract itself. It beats once for every new block on Arc, so you are watching in real time.'],
 ['veins','Blue veins','Money coming in: people buying a token or depositing into a contract.'],
 ['arteries','Red arteries','Money going out: people selling or withdrawing. If sells stall partway down, you will see them stop.'],
 ['groups','Wallet groups','Each bubble is a group of wallets and each dot is one wallet. Wallets funded by the same source that move together are grouped. Dashed means we are less sure.'],
 ['warning','Amber warnings','Something worth a second look, like one wallet funding many brand-new ones. Tap a warning in the scanner to see the evidence.'],
 ['valve','Valves','A power the owner holds, held back by a delay or a cap. A vessel with no valve means they can use it instantly.']
];
let hl=null,markers=[];
function drawAnat(canvas,t){
  const s=setup(canvas);if(!s)return;const {g,w,h}=s;
  const u=.2*w,cx=w*.52,cy=h*.56,sc=w/560;
  const ph=RM?0:t%1,pV=.85*pc(ph-.1),pA=.85*pc(ph);
  const A=id=>hl&&hl!==id?.28:1;
  const inflow=[cx+HEART_PORTS.inflow[0]*u,cy+HEART_PORTS.inflow[1]*u],outflow=[cx+HEART_PORTS.outflow[0]*u,cy+HEART_PORTS.outflow[1]*u];
  const va=[w*.03,h*.44],ra=[w*.9,h*.4];
  const G=[w*.17,h*.8],rG=w*.085,O=[w*.14,h*.17],rO=w*.04;
  // vessels
  g.globalAlpha=A('veins');
  const vc=vessel(g,va,inflow,.2,VEIN_RGB,3*sc,1);dots(g,va,vc,inflow,t,'#4fb5e6',sc,1,5);
  g.globalAlpha=A('groups');
  const gc=vessel(g,G,inflow,-.22,VEIN_RGB,2.4*sc,.8);
  g.globalAlpha=A('arteries');
  const rc=vessel(g,outflow,ra,-.2,ART_RGB,3*sc,1);dots(g,outflow,rc,ra,t,'#ff5a45',sc,1,5);
  g.globalAlpha=A('valve');
  const sh=[cx-.25*u,cy-.15*u];
  const p1=vessel(g,sh,O,-.18,ART_RGB,3.4*sc,1);
  g.setLineDash([7,6]);const p2=vessel(g,sh,O,.1,BONE,2*sc,.8);g.setLineDash([]);
  const [vx,vy]=bez(sh,p2,O,.38),[wx,wy]=bez(sh,p2,O,.42),ang=Math.atan2(wy-vy,wx-vx)+Math.PI/2;
  g.strokeStyle=`rgb(${BONE})`;g.lineWidth=2.2;
  for(const o of [-2.5,2.5]){g.beginPath();g.moveTo(vx+Math.cos(ang)*7+o*Math.cos(ang+1.57),vy+Math.sin(ang)*7+o*Math.sin(ang+1.57));g.lineTo(vx-Math.cos(ang)*7+o*Math.cos(ang+1.57),vy-Math.sin(ang)*7+o*Math.sin(ang+1.57));g.stroke();}
  organ(g,O[0],O[1],rO,{dots:1,ph:1},t);
  g.globalAlpha=1;
  // end of artery: other holders
  g.globalAlpha=A('arteries');organ(g,ra[0]+w*.02,ra[1],w*.06,{dots:18,dash:[1.5,4],ph:2},t);g.globalAlpha=1;
  // heart
  g.globalAlpha=A('heart');
  const gl=g.createRadialGradient(cx,cy,u*.2,cx,cy,u*1.8);gl.addColorStop(0,`rgba(255,70,60,${.1+.22*pV})`);gl.addColorStop(1,'rgba(255,70,60,0)');
  g.fillStyle=gl;g.fillRect(0,0,w,h);
  drawHeart(g,cx,cy,u,pV,pA,t);g.globalAlpha=1;
  // wallet group + warning
  g.globalAlpha=A('groups');organ(g,G[0],G[1],rG,{dots:9,dash:[5,4],ph:3},t);g.globalAlpha=1;
  g.globalAlpha=A('warning');
  g.strokeStyle=`rgba(${AMBER},.95)`;g.lineWidth=1.8;
  for(let i=0;i<14;i++){const a=i/14*Math.PI*2+(RM?0:t*.15),r0=rG*1.3,len=(5+(RM?0:3*Math.sin(t*2.2+i)))*sc*1.2;g.beginPath();g.moveTo(G[0]+Math.cos(a)*r0,G[1]+Math.sin(a)*r0);g.lineTo(G[0]+Math.cos(a)*(r0+len),G[1]+Math.sin(a)*(r0+len));g.stroke();}
  g.setLineDash([5,4]);blob(g,G[0],G[1],rG*1.12,3,t);g.strokeStyle=`rgba(${AMBER},.9)`;g.lineWidth=1.5;g.stroke();g.setLineDash([]);
  g.globalAlpha=1;
  // numbered markers
  const mid=bez(va,vc,inflow,.45),amid=bez(outflow,rc,ra,.5);
  markers=[
   {id:'heart',x:cx+1.12*u,y:cy-.75*u},
   {id:'veins',x:mid[0],y:mid[1]-18},
   {id:'arteries',x:amid[0],y:amid[1]-18},
   {id:'groups',x:G[0]+rG*1.1,y:G[1]+rG*1.05},
   {id:'warning',x:G[0]-rG*1.2,y:G[1]-rG*1.3},
   {id:'valve',x:vx+16,y:vy+14}
  ];
  markers.forEach((m,i)=>{
    const on=hl===m.id;
    g.beginPath();g.arc(m.x,m.y,13,0,7);g.fillStyle=on?`rgb(${BONE})`:'#170a14';g.fill();
    g.strokeStyle=`rgb(${BONE})`;g.lineWidth=1.6;g.stroke();
    g.fillStyle=on?'#170a14':`rgb(${BONE})`;g.font=`600 14px ${getComputedStyle(document.body).fontFamily}`;g.textAlign='center';g.fillText(String(i+1),m.x,m.y+5);
  });
}
/* parts list */
function selectPart(id){
  hl=hl===id?null:id;
  [...$('L-parts').children].forEach(li=>{const b=li.firstChild;b.setAttribute('aria-expanded',String(b.dataset.id===hl));});
}
$('L-parts').innerHTML=PARTS.map((p,i)=>`<li><button class="L-part" data-id="${p[0]}" aria-expanded="false"><strong><i>${i+1}</i>${p[1]}</strong><span>${p[2]}</span></button></li>`).join('');
$('L-parts').addEventListener('click',e=>{const b=e.target.closest('.L-part');if(b)selectPart(b.dataset.id);});
$('L-anat').addEventListener('pointerdown',e=>{
  const r=e.currentTarget.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
  const m=markers.find(m=>Math.hypot(m.x-x,m.y-y)<20);if(m)selectPart(m.id);
});
selectPart('heart');

/* verdict preview */
const SAMPLES=[
 {id:'router',name:'ArcSwap Router',score:12,col:'#4fb5e6',act:'Looks okay to use',head:'This looks like an ordinary swap router, and its admin cannot change much without warning.',label:'What looks good',
  rs:[['ok','Anyone can read the code, and it matches what is actually live.'],['ok','Any change needs three of five people to agree, plus a two-day wait. Nothing can change overnight.'],['ok','No one can create extra tokens out of thin air.']]},
 {id:'moony',name:'MOONY',score:96,col:'#ff5a45',act:'Avoid this one',head:'You can buy this token, but you almost certainly cannot sell it.',label:'Why',
  rs:[['high','You can buy this token, but selling fails or gives back almost nothing. This is the classic trap.'],['high','The owner can take up to all of your money when you sell. Right now it takes 99%.'],['high','The owner can print new tokens whenever they like, which makes yours worth less.']]},
 {id:'vault',name:'VaultX',score:60,col:'#f5b83d',act:'Be careful',head:'Your money here is only as safe as one person behaving well.',label:'Why',
  rs:[['high','The person running it can swap in new code at any time, even code that changes who controls your deposits.'],['med','There is no waiting period, so changes land with no warning.'],['med','The admin can take out money that is sitting unused.']]}
];
const SV={high:'High',med:'Medium',ok:'Good'};
let cur=1;
function renderV(){
  const s=SAMPLES[cur];
  [...$('L-tabs').children].forEach((b,i)=>b.setAttribute('aria-selected',String(i===cur)));
  $('L-verdict').innerHTML=`<div class="L-score" style="color:${s.col}">${s.score}<small>Risk score,<br>0 to 100</small></div><div><div class="L-vh">${s.head}</div><div class="L-vact" style="color:${s.col}">${s.act}</div><ul class="L-vl">${s.rs.map(r=>`<li><span class="sv ${r[0]}">${SV[r[0]]}</span><span>${r[1]}</span></li>`).join('')}</ul><button class="L-btn" id="L-open">Open ${s.name} in the scanner</button></div>`;
  $('L-open').onclick=()=>{closeL();window.__arc.start('contract',s.id);};
}
$('L-tabs').innerHTML=SAMPLES.map((s,i)=>`<button class="L-tab" role="tab" data-i="${i}" aria-selected="false">${s.name}</button>`).join('');
$('L-tabs').addEventListener('click',e=>{const b=e.target.closest('.L-tab');if(b){cur=+b.dataset.i;renderV();}});
renderV();

/* animation loop, only while the page is open and visible */
let t0=performance.now();
function loop(now){
  if(window.__landingOpen&&!L.hidden){
    const t=(now-t0)/1000;
    drawHero($('L-hero'),t);
    drawAnat($('L-anat'),t);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
})();
//#LANDING_END
