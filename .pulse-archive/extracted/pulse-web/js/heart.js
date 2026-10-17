// Anatomical heart, anterior view. Local units: u = 1 is roughly half the ventricle width.
// Ports (local coords): inflow = top of superior vena cava, outflow = top of aortic branch.
const HEART_PORTS={inflow:[-.6,-1.16],outflow:[.3,-1.36]};
function drawHeart(g,cx,cy,u,pV,pA,t){
  g.save();g.translate(cx,cy);g.scale(u,u);
  const lw=px=>px/u; // pixel-ish line width in local units
  const tube=(pts,w,base,hi,dark)=>{
    const path=()=>{g.beginPath();g.moveTo(pts[0][0],pts[0][1]);
      for(let i=1;i<pts.length;i+=3)g.bezierCurveTo(pts[i][0],pts[i][1],pts[i+1][0],pts[i+1][1],pts[i+2][0],pts[i+2][1]);};
    g.lineCap='round';g.lineJoin='round';
    path();g.strokeStyle=dark;g.lineWidth=w*1.12;g.stroke();
    path();g.strokeStyle=base;g.lineWidth=w;g.stroke();
    g.save();g.translate(-w*.14,-w*.14);path();g.strokeStyle=hi;g.lineWidth=w*.28;g.stroke();g.restore();
  };
  const ao=1+.14*pV;
  // left atrium, tucked behind
  g.save();g.translate(.5,-.42);g.scale(1+.05*pA,1+.05*pA);
  g.beginPath();g.ellipse(0,0,.3,.2,-.35,0,7);
  let gr=g.createRadialGradient(-.05,-.05,.02,0,0,.32);gr.addColorStop(0,'#a8303d');gr.addColorStop(1,'#4a0f1d');
  g.fillStyle=gr;g.fill();g.restore();

  // aorta: root, arch, three branches
  tube([[.04,-.3],[.0,-.7],[.05,-1.05],[.3,-1.1],[.55,-1.12],[.68,-.95],[.68,-.62]],.27*ao,'#a3222f','#e0574a','#3e0a14');
  tube([[.2,-1.08],[.2,-1.2],[.2,-1.28],[.3,-1.36]],.13*ao,'#a3222f','#e0574a','#3e0a14');
  tube([[.1,-1.06],[.06,-1.15],[.0,-1.22],[-.05,-1.3]],.1*ao,'#a3222f','#e0574a','#3e0a14');
  tube([[.4,-1.1],[.44,-1.18],[.48,-1.24],[.52,-1.3]],.09*ao,'#a3222f','#e0574a','#3e0a14');
  // superior vena cava
  tube([[-.58,-.3],[-.6,-.6],[-.6,-.9],[-.6,-1.16]],.2,'#3d5f9e','#7fa2d8','#1c2f58');
  // inferior vena cava stub
  tube([[-.62,.2],[-.62,.3],[-.6,.38],[-.6,.46]],.18,'#34528d','#6b8ec6','#17274a');
  // pulmonary trunk in front of the aorta
  tube([[.3,-.38],[.3,-.6],[.34,-.8],[.12,-.92]],.2*ao,'#4a5aa0','#8b9bd4','#202a5a');
  tube([[.34,-.8],[.5,-.9],[.7,-.92],[.88,-.84]],.16*ao,'#4a5aa0','#8b9bd4','#202a5a');

  // right atrium and its auricle
  g.save();g.translate(-.62,-.1);g.scale(1+.06*pA,1+.06*pA);
  g.beginPath();g.moveTo(-.22,-.3);g.bezierCurveTo(-.38,-.1,-.34,.3,-.05,.38);g.bezierCurveTo(.2,.42,.3,.1,.26,-.12);g.bezierCurveTo(.24,-.3,.1,-.38,-.05,-.38);g.bezierCurveTo(-.12,-.38,-.18,-.35,-.22,-.3);g.closePath();
  gr=g.createRadialGradient(-.1,-.12,.02,0,0,.42);gr.addColorStop(0,'#b83a45');gr.addColorStop(.7,'#7a1a2c');gr.addColorStop(1,'#4a0f1d');
  g.fillStyle=gr;g.fill();g.strokeStyle='rgba(40,6,14,.8)';g.lineWidth=lw(1.2);g.stroke();
  g.beginPath();g.moveTo(.1,-.3);g.bezierCurveTo(.3,-.5,.5,-.4,.46,-.22);g.bezierCurveTo(.4,-.1,.22,-.14,.1,-.12);g.closePath();
  g.fillStyle='#8f2535';g.fill();g.stroke();
  g.restore();

  // ventricles
  g.save();
  g.translate(.2,.55);g.scale(1-.07*pV,1-.09*pV);g.translate(-.2,-.55);
  const vent=()=>{g.beginPath();g.moveTo(-.5,-.2);
    g.bezierCurveTo(-.82,.35,-.3,.92,.4,1.06);
    g.bezierCurveTo(.92,.8,1.08,.05,.62,-.34);
    g.bezierCurveTo(.3,-.56,-.28,-.52,-.5,-.2);g.closePath();};
  g.shadowColor='rgba(0,0,0,.55)';g.shadowBlur=lw(14);g.shadowOffsetY=lw(4);
  vent();g.fillStyle='#6a1527';g.fill();
  g.shadowColor='transparent';g.shadowBlur=0;g.shadowOffsetY=0;
  gr=g.createRadialGradient(.0,.0,.05,.25,.35,1.1);
  gr.addColorStop(0,'#d4565a');gr.addColorStop(.35,'#b23346');gr.addColorStop(.75,'#7a1a2e');gr.addColorStop(1,'#420c19');
  vent();g.fillStyle=gr;g.fill();
  g.save();vent();g.clip();
  // right ventricle: lighter, left of the interventricular groove
  g.beginPath();g.moveTo(-.6,-.3);g.lineTo(.12,-.5);g.bezierCurveTo(.02,.1,.12,.6,.4,1.08);g.lineTo(-.7,1.1);g.closePath();
  gr=g.createLinearGradient(-.6,0,.2,.4);gr.addColorStop(0,'rgba(222,120,110,.34)');gr.addColorStop(1,'rgba(222,120,110,.05)');
  g.fillStyle=gr;g.fill();
  // fat along the groove between atria and ventricles
  g.lineCap='round';
  for(let i=0;i<46;i++){
    const s=i/45,x=-.72+s*1.4,y=-.34-.12*Math.sin(s*Math.PI)+.14*(1-s)*(1-s);
    const jx=Math.sin(i*12.9)*.03,jy=Math.cos(i*7.3)*.025;
    g.fillStyle=`rgba(236,190,110,${.28+.2*Math.abs(Math.sin(i*3.1))})`;
    g.beginPath();g.ellipse(x+jx,y+jy,.05+.03*Math.abs(Math.sin(i*5.7)),.03,0,0,7);g.fill();
  }
  // fat along the groove down the front
  for(let i=0;i<30;i++){
    const s=i/29,x=.12+s*.3+Math.sin(i*9.1)*.02,y=-.46+s*1.5;
    g.fillStyle=`rgba(236,190,110,${.22+.15*Math.abs(Math.sin(i*2.3))})`;
    g.beginPath();g.ellipse(x,y,.035,.045,0,0,7);g.fill();
  }
  // coronary arteries
  const art=(pts,w,col)=>{g.beginPath();g.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i+=3)g.bezierCurveTo(pts[i][0],pts[i][1],pts[i+1][0],pts[i+1][1],pts[i+2][0],pts[i+2][1]);g.strokeStyle=col;g.lineWidth=w;g.stroke();};
  art([[.14,-.5],[.12,-.1],[.2,.5],[.38,1.0]],.028,'#e8483a');
  art([[.14,-.3],[.3,-.2],[.5,-.05],[.66,.25]],.016,'#e8483a');
  art([[.17,-.05],[.3,.1],[.45,.3],[.56,.6]],.014,'#e8483a');
  art([[.18,.3],[.05,.4],[-.1,.5],[-.3,.62]],.014,'#e8483a');
  art([[.15,.1],[.0,.2],[-.15,.3],[-.35,.35]],.012,'#e8483a');
  art([[-.5,-.35],[-.72,-.05],[-.72,.3],[-.5,.65]],.024,'#e8483a');
  art([[-.7,.1],[-.55,.2],[-.4,.35],[-.3,.55]],.012,'#e8483a');
  // cardiac veins
  art([[.2,-.45],[.2,0],[.28,.5],[.44,.95]],.016,'#5d79bb');
  art([[.62,-.3],[.78,0],[.82,.4],[.62,.8]],.016,'#5d79bb');

  for(let i=0;i<260;i++){
    const x=-.8+((i*0.6180339)%1)*1.9,y=-.5+((i*0.7548776)%1)*1.6;
    g.fillStyle=i%2?'rgba(255,200,190,.05)':'rgba(30,0,10,.07)';
    g.beginPath();g.arc(x,y,.012+.01*((i*13)%5)/5,0,7);g.fill();
  }
  g.lineWidth=.012;
  for(let i=0;i<14;i++){
    const o=-.5+i*.1;
    g.strokeStyle=i%2?'rgba(255,190,180,.07)':'rgba(40,0,12,.1)';
    g.beginPath();g.moveTo(o,-.4);g.bezierCurveTo(o-.15,.2,o+.1,.7,.4,1.05);g.stroke();
  }
  // rim shading and specular
  gr=g.createRadialGradient(.2,.4,.4,.2,.4,1.1);gr.addColorStop(0,'rgba(20,0,8,0)');gr.addColorStop(1,'rgba(20,0,8,.5)');
  g.fillStyle=gr;g.fillRect(-1,-1,2.2,2.4);
  g.save();g.translate(-.18,-.05);g.rotate(-.55);
  g.beginPath();g.ellipse(0,0,.13,.4,0,0,7);
  gr=g.createLinearGradient(0,-.4,0,.4);gr.addColorStop(0,'rgba(255,225,215,.34)');gr.addColorStop(1,'rgba(255,225,215,0)');
  g.fillStyle=gr;g.fill();g.restore();
  g.restore();
  vent();g.strokeStyle='rgba(36,4,12,.9)';g.lineWidth=lw(1.3);g.stroke();
  g.restore();

  // left auricle in front of the pulmonary trunk
  g.save();g.translate(.58,-.52);g.scale(1+.05*pA,1+.05*pA);g.rotate(.5);
  g.beginPath();g.moveTo(-.16,.08);g.bezierCurveTo(-.12,-.18,.18,-.2,.22,.02);g.bezierCurveTo(.2,.14,.0,.14,-.16,.08);g.closePath();
  gr=g.createLinearGradient(0,-.2,0,.15);gr.addColorStop(0,'#b53846');gr.addColorStop(1,'#6a1527');
  g.fillStyle=gr;g.fill();g.strokeStyle='rgba(40,6,14,.8)';g.lineWidth=lw(1.1);g.stroke();
  g.restore();
  g.restore();
}
