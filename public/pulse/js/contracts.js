const SEV_W={high:.4,med:.18,low:.06,ok:0,info:0};
const SEV_ORDER={high:0,med:1,low:2,ok:3,info:4};
function scoreOf(contract){
  let remaining=1;
  contract.findings.forEach(finding=>{remaining*=1-(SEV_W[finding.sev]||0);});
  return Math.round((1-remaining)*100);
}
function verdictOf(score){
  if(score<20)return {action:'Limited scan',label:'Basic onchain facts only',color:'#4fb5e6',text:'This scan reports basic onchain facts only. No security conclusion can be drawn from bytecode presence or balance alone.'};
  if(score<65)return {action:'Review findings',label:'Signals need review',color:'#f5b83d',text:'Review the observed signals and their evidence before interacting.'};
  return {action:'Avoid this one',label:'High-risk signals found',color:'#ff5a45',text:'Several high-risk findings were observed. Avoid interacting unless you can explain every one.'};
}
