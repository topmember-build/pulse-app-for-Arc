//#SIM_START
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const SIM=(function(){
  const N=140;
  const ids=['F','A','B','R','P','X','W'];
  const names={F:'Funding wallet',A:'Cluster A',B:'Cluster B',R:'Other holders',P:'Liquidity pool',X:'Exchange deposit',W:'Large wallet'};
  const rnd=mulberry32(11);
  const bt=(a,b)=>a+(b-a)*rnd();
  const ri=(a,b)=>Math.floor(bt(a,b+1));
  const blocks=Array.from({length:N},()=>[]);
  const add=(b,t)=>{if(b>=0&&b<N)blocks[b].push(t);};

  // Scripted launch. Each entry is one group of transfers inside a block.
  add(1,{from:'F',to:'P',type:'transfer',usd:60000,n:1});
  for(let b=3;b<=9;b++)add(b,{from:'F',to:'A',type:'transfer',usd:2400,n:2,fresh:2});
  for(let b=7;b<=21;b++)add(b,{from:'A',to:'P',type:'buy',pts:bt(.8,1.2),n:ri(3,6)});
  for(let b=5;b<N;b++){
    if(b>=100&&b<=120)add(b,{from:'P',to:'R',type:'sell',pts:bt(.35,.65),n:ri(14,26)});
    else{const base=b<22?.12:b<60?.38:b<100?.22:.1;const p=base*bt(.7,1.3);add(b,{from:'R',to:'P',type:'buy',pts:p,n:Math.round(p*35+ri(2,5))});}
  }
  for(let b=36;b<=44;b++)add(b,{from:'F',to:'B',type:'transfer',usd:2000,n:1,fresh:1});
  for(let b=40;b<=56;b++)add(b,{from:'B',to:'P',type:'buy',pts:.45*bt(.8,1.2),n:ri(1,3)});
  add(50,{from:'A',to:'B',type:'transfer',usd:5000,n:1});
  add(53,{from:'B',to:'F',type:'transfer',usd:4900,n:1});
  add(56,{from:'F',to:'A',type:'transfer',usd:4900,n:1});
  [68,69,70].forEach(b=>add(b,{from:'W',to:'P',type:'buy',pts:bt(1.25,1.45),n:1}));
  for(let b=95;b<=112;b++)add(b,{from:'P',to:'A',type:'sell',pts:.5*bt(.85,1.15),n:ri(4,9)});
  for(let b=100;b<=116;b+=2)add(b,{from:'A',to:'X',type:'transfer',usd:25000,n:1,pts:.4});
  for(let b=108;b<=120;b++)add(b,{from:'P',to:'B',type:'sell',pts:.4,n:ri(2,4)});
  for(let b=104;b<=116;b+=3)add(b,{from:'B',to:'X',type:'transfer',usd:18000,n:1,pts:.3});
  for(let b=75;b<N;b+=2)add(b,{from:'R',to:'X',type:'transfer',usd:Math.round(bt(1500,4000)),n:ri(3,8),pts:.04});
  [125,126,127].forEach(b=>add(b,{from:'P',to:'W',type:'sell',pts:bt(1.25,1.45),n:1}));

  const hold={F:0,A:0,B:0,R:0,P:100,X:0,W:0};
  const wallets={F:1,A:0,B:0,R:0,P:1,X:1,W:0};
  const usdBuy={F:0,A:0,B:0,R:0,P:0,X:0,W:0};
  const usdSell={F:0,A:0,B:0,R:0,P:0,X:0,W:0};
  const edgeVol={},last={};
  const appear={F:null,A:null,B:null,R:null,P:0,X:null,W:null};
  const flags=[],evA=[],evB=[],holdHist=[],freshHist=[],recentTr=[];
  const sentX={A:false,B:false};
  const have=(arr,key)=>arr.some(e=>e.key===key);
  const states=[],cnt=[],tcCum=[],pcCum=[];
  let tc=0,pc=0;
  const pct=x=>x.toFixed(1)+'%';
  const usd0=x=>'$'+Math.round(x).toLocaleString('en-US');
  const sum=a=>a.reduce((s,e)=>s+e.w,0);

  for(let b=0;b<N;b++){
    let c=0;const freshB={};
    for(const tx of blocks[b]){
      const price=2200+90*(100-hold.P);
      if(tx.type==='buy'){
        tx.pts=Math.min(tx.pts,hold.P);
        if(tx.usd==null)tx.usd=Math.round(tx.pts*price/10)*10;
        hold[tx.from]+=tx.pts;hold.P-=tx.pts;usdBuy[tx.from]+=tx.usd;
      }else if(tx.type==='sell'){
        tx.pts=Math.min(tx.pts,hold[tx.to]);
        if(tx.usd==null)tx.usd=Math.round(tx.pts*price/10)*10;
        hold[tx.to]-=tx.pts;hold.P+=tx.pts;usdSell[tx.to]+=tx.usd;
      }else if(tx.pts){
        tx.pts=Math.min(tx.pts,hold[tx.from]);
        hold[tx.from]-=tx.pts;hold[tx.to]+=tx.pts;
      }
      if(tx.usd==null)tx.usd=0;
      if(tx.fresh){wallets[tx.to]+=tx.fresh;freshB[tx.from]=(freshB[tx.from]||0)+tx.fresh;}
      if(tx.type==='buy'&&tx.from==='R')wallets.R=Math.min(420,wallets.R+Math.max(1,Math.round(tx.n*.5)));
      if(tx.type==='buy'&&tx.from==='W')wallets.W=1;
      [tx.from,tx.to].forEach(id=>{if(appear[id]==null)appear[id]=b;});
      const key=(tx.from==='P'||tx.to==='P')?tx.from+'>'+tx.to:[tx.from,tx.to].sort().join('-');
      edgeVol[key]=(edgeVol[key]||0)+tx.usd;last[key]=b;
      c+=tx.n;tc+=tx.n;pc+=Math.min(tx.n,3);
      if(tx.type==='transfer'&&'FABW'.includes(tx.from)&&'FABW'.includes(tx.to)&&tx.usd>=1000)recentTr.push({b,from:tx.from,to:tx.to,usd:tx.usd});
      if(tx.to==='X'&&(tx.from==='A'||tx.from==='B'))sentX[tx.from]=true;
    }
    cnt.push(c);tcCum.push(tc);pcCum.push(pc);
    freshHist.push(freshB);holdHist.push({...hold});

    // Detector 1: one wallet funds many brand-new wallets in a short window
    if(!flags.some(f=>f.id==='fan')){
      for(const src of ids){
        let s=0,first=null;
        for(let k=Math.max(0,b-11);k<=b;k++){const v=freshHist[k][src]||0;if(v&&first==null)first=k;s+=v;}
        if(s>=10){
          flags.push({id:'fan',type:'fan',short:'One wallet funded many',block:b,clusters:[src,'A'],
            title:'Fan-out from one wallet',
            detail:`${names[src]} sent equal-size transfers to ${s} brand-new wallets in ${b-first+1} blocks.`});
          break;
        }
      }
    }
    // Detector 2: matching amounts moving in a circle between non-contract wallets
    if(!flags.some(f=>f.id==='loop')){
      const m={};
      for(const t of recentTr){if(t.b>b-15){const k=t.from+'>'+t.to;m[k]=Math.max(m[k]||0,t.usd);}}
      const nodes=['F','A','B','W'];
      outer:for(const x of nodes)for(const y of nodes)for(const z of nodes){
        if(x===y||y===z||x===z)continue;
        const a1=m[x+'>'+y],a2=m[y+'>'+z],a3=m[z+'>'+x];
        if(a1&&a2&&a3&&Math.max(a1,a2,a3)/Math.min(a1,a2,a3)<=1.2){
          const bs=recentTr.filter(t=>t.b>b-15).map(t=>t.b);
          flags.push({id:'loop',type:'loop',short:'Money moved in a circle',block:b,clusters:[x,y,z],
            title:'Circular transfers',
            detail:`About ${usd0((a1+a2+a3)/3)} moved ${names[x]} → ${names[y]} → ${names[z]} → ${names[x]} within ${b-Math.min(...bs)+1} blocks.`});
          break outer;
        }
      }
    }
    // Detector 3: a linked group's share of supply jumps quickly
    for(const id of ['A','B']){
      const fid='swell'+id;
      if(!flags.some(f=>f.id===fid)){
        const from=Math.max(0,b-10),d=hold[id]-holdHist[from][id];
        if(d>=5)flags.push({id:fid,type:'swell',short:'Group bought fast',block:b,clusters:[id],
          title:'Rapid accumulation',
          detail:`${names[id]} went from ${pct(holdHist[from][id])} to ${pct(hold[id])} of supply in ${b-from} blocks.`});
      }
    }
    // Evidence that wallets belong together
    if(wallets.A>=14&&!have(evA,'funder')){
      evA.push({key:'funder',w:.45,block:b,text:'Funded by the same wallet: 14 new wallets, 1,200 USDC each.'});
      evA.push({key:'equal',w:.15,block:b,text:'Every funding transfer was the same amount.'});
    }
    if(b>=21&&have(evA,'funder')&&!have(evA,'timing'))evA.push({key:'timing',w:.15,block:b,text:'All 14 wallets bought inside the same 15 blocks.'});
    if(wallets.B>=9&&!have(evB,'funder'))evB.push({key:'funder',w:.35,block:b,text:'Funded by the same wallet as Cluster A: 9 new wallets, 2,000 USDC each.'});
    if(flags.some(f=>f.id==='loop')){
      if(!have(evA,'loop'))evA.push({key:'loop',w:.10,block:b,text:'Moved matching amounts in a circle with Cluster B and the funding wallet.'});
      if(!have(evB,'loop'))evB.push({key:'loop',w:.20,block:b,text:'Moved matching amounts in a circle with Cluster A and the funding wallet.'});
    }
    if(sentX.A&&sentX.B){
      if(!have(evA,'exit'))evA.push({key:'exit',w:.10,block:b,text:'Sent proceeds to the same exchange deposit as Cluster B.'});
      if(!have(evB,'exit'))evB.push({key:'exit',w:.12,block:b,text:'Sent proceeds to the same exchange deposit as Cluster A.'});
    }
    states.push({
      hold:{...hold},wallets:{...wallets},usdBuy:{...usdBuy},usdSell:{...usdSell},
      edgeVol:{...edgeVol},last:{...last},flags:flags.slice(),
      ev:{A:evA.slice(),B:evB.slice()},conf:{A:Math.min(.97,sum(evA)),B:Math.min(.97,sum(evB))}
    });
  }
  return {N,ids,names,blocks,states,appear,cnt,tcCum,pcCum};
})();
//#SIM_END