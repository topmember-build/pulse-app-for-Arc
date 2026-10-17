//#CONTRACTS_START
const CONTRACTS=[
{id:'router',name:'ArcSwap Router',kind:'DEX router',addr:'0x8c1d…20ab',headline:'This looks like an ordinary swap router, and its admin cannot change much without warning.',
 beat:{every:.8,jitter:.06},flow:{dep:2,wd:2,fail:0},
 owner:{type:'multisig',label:'Multisig 3 of 5, 48h timelock',dots:5,lit:3,last:'last used 11 days ago'},
 facts:[['Source code','Verified'],['Age','94 days'],['Calls so far','1.8M'],['Upgradeable','No']],
 powers:[
  {id:'pause',label:'Pause',guard:'timelock',guardLabel:'48h timelock',sev:'low',siphon:false},
  {id:'fee',label:'Set fee',guard:'capped',guardLabel:'capped at 0.3%',sev:'low',siphon:false}],
 findings:[
  {sev:'ok',short:'Verified source',plain:'Anyone can read the code, and it matches what is actually live.',title:'Source code is verified',detail:'The published source matches the deployed bytecode.',where:'bytecode comparison'},
  {sev:'ok',short:'No mint',plain:'No one can create extra tokens out of thin air.',title:'No way to create new tokens',detail:'The contract has no mint function and holds no token supply of its own.',where:'ABI scan'},
  {sev:'ok',short:'Timelocked admin',plain:'Any change needs three of five people to agree, plus a two-day wait. Nothing can change overnight.',title:'Admin is a 3-of-5 multisig with a 48-hour timelock',detail:'Privileged changes are queued for two days before they take effect.',where:'owner() → timelock contract'},
  {sev:'low',short:'Can pause',plain:'The admin can stop swaps for a while. Your money is not held here, so you cannot get stuck.',title:'Admin can pause swaps',detail:'Swaps stop while paused. Funds are not held in the router, so nothing is locked.',where:'pause() · onlyAdmin',power:'pause'},
  {sev:'low',short:'Fee can change',plain:'The fee can change, but never above 0.3%.',title:'Fee can be changed, up to 0.3%',detail:'The cap is enforced in code, so the admin cannot raise it further.',where:'setFee(uint256) · require(fee <= 30)',power:'fee'},
  {sev:'ok',short:'Exact approvals',plain:'It only asks to spend the amount you are swapping, not everything you own.',title:'Asks for the exact swap amount',detail:'The router never requests an unlimited token approval.',where:'transferFrom call sites'},
  {sev:'info',short:'Steady use',plain:'Lots of different people have used it for three months without trouble.',title:'Used steadily for 94 days',detail:'1.8M calls from many different wallets. No sudden spikes.',where:'call history'}]},
{id:'moony',name:'MOONY',kind:'Token',addr:'0x4f09…be17',headline:'You can buy this token, but you almost certainly cannot sell it.',
 beat:{every:1.15,jitter:.55},flow:{dep:3,wd:3,fail:.96},
 owner:{type:'eoa',label:'One wallet, no timelock',dots:1,lit:1,last:'last used 2 hours ago'},
 top:{label:'Top 5 wallets',share:62,dots:5},
 facts:[['Source code','Not verified'],['Age','6 days'],['Calls so far','48K'],['Upgradeable','No']],
 powers:[
  {id:'mint',label:'Mint',guard:'none',guardLabel:'one wallet',sev:'high',siphon:false},
  {id:'tax',label:'Set sell tax',guard:'none',guardLabel:'no cap',sev:'high',siphon:true},
  {id:'blacklist',label:'Blacklist',guard:'none',guardLabel:'one wallet',sev:'med',siphon:false}],
 findings:[
  {sev:'high',short:'Sells fail',plain:'You can buy this token, but selling fails or gives back almost nothing. This is the classic trap.',title:'Sells fail or lose almost everything in a test',detail:'Simulated 30 sells: 29 reverted and 1 returned about 1% of its value. Buys went through every time.',where:'eth_call simulation'},
  {sev:'high',short:'Sell tax up to 100%',plain:'The owner can take up to all of your money when you sell. Right now it takes 99%.',title:'Sell tax can be set to 100%',detail:'It is currently 99% on sells and 0% on buys.',where:'setTax(uint256,uint256) · no upper limit',power:'tax'},
  {sev:'high',short:'Unlimited mint',plain:'The owner can print new tokens whenever they like, which makes yours worth less.',title:'Owner can mint unlimited tokens',detail:'New tokens can be created at any time, which dilutes every other holder.',where:'mint(address,uint256) · onlyOwner',power:'mint'},
  {sev:'high',short:'One-wallet owner',plain:'One person can change the rules instantly and nobody can stop them.',title:'A single wallet controls everything',detail:'No multisig and no timelock. One key can change the rules instantly.',where:'owner() → 0x71c2…9d04 (single wallet)'},
  {sev:'high',short:'Liquidity unlocked',plain:'The same person can pull out the money buyers trade against, leaving the token worthless.',title:'Liquidity is not locked',detail:'The same wallet holds 71% of the liquidity tokens and can remove them at any time.',where:'LP token holders'},
  {sev:'med',short:'Can blacklist',plain:'The owner can block your wallet from selling.',title:'Owner can block wallets from trading',detail:'Any address can be added to a blocklist.',where:'setBlacklist(address,bool) · onlyOwner',power:'blacklist'},
  {sev:'med',short:'Unverified source',plain:'Nobody can read the code, so we checked how it behaves instead.',title:'Source code is not verified',detail:'Only bytecode is public, so this scan relied on function signatures and simulation.',where:'explorer lookup'},
  {sev:'med',short:'Top 5 hold 62%',plain:'A handful of wallets own most of it and can crash the price by selling.',title:'Five wallets hold 62% of supply',detail:'A few holders can move the price on their own.',where:'holder snapshot'}]},
{id:'vault',name:'VaultX',kind:'Yield vault (proxy)',addr:'0x93d2…7c40',headline:'Your money here is only as safe as one person behaving well.',
 beat:{every:1.5,jitter:.08},flow:{dep:1,wd:1,fail:0},
 owner:{type:'eoa',label:'Proxy admin: one wallet',dots:1,lit:1,last:'last used 3 days ago'},
 facts:[['Source code','Verified'],['Age','41 days'],['Calls so far','212K'],['Upgradeable','Yes, by one wallet']],
 powers:[
  {id:'upgrade',label:'Upgrade logic',guard:'none',guardLabel:'one wallet',sev:'high',siphon:false},
  {id:'withdraw',label:'Withdraw idle funds',guard:'none',guardLabel:'one wallet',sev:'med',siphon:false}],
 findings:[
  {sev:'high',short:'Upgradeable by one wallet',plain:'The person running it can swap in new code at any time, even code that changes who controls your deposits.',title:'The contract can be swapped out by one wallet',detail:'The proxy admin can point the vault at new logic that handles deposits differently.',where:'proxy admin → 0x5d8e…31ca (single wallet)',power:'upgrade'},
  {sev:'med',short:'No upgrade delay',plain:'There is no waiting period, so changes land with no warning.',title:'Upgrades take effect immediately',detail:'There is no timelock, so users get no warning before logic changes.',where:'ProxyAdmin.upgrade() · no delay',power:'upgrade'},
  {sev:'med',short:'Admin can withdraw',plain:'The admin can take out money that is sitting unused.',title:'Admin can move idle funds',detail:'Funds that are not deployed into a strategy can be withdrawn by the admin.',where:'withdrawIdle(address) · onlyAdmin',power:'withdraw'},
  {sev:'ok',short:'Verified source',plain:'Anyone can read the code, and it matches what is actually live.',title:'Source code is verified',detail:'The published source matches the deployed implementation.',where:'bytecode comparison'},
  {sev:'ok',short:'Reentrancy guard',plain:'It has protection against a common way of draining vaults.',title:'Deposit and withdraw are protected against reentrancy',detail:'Both functions use a reentrancy lock.',where:'nonReentrant modifier'},
  {sev:'ok',short:'Withdrawals work',plain:'In a test, deposits and withdrawals worked and returned what they should, minus a small 0.2% fee.',title:'Withdrawals work in a test',detail:'A simulated deposit and withdrawal returned the amount minus the stated 0.2% fee.',where:'eth_call simulation'},
  {sev:'info',short:'Admin active',plain:'The admin wallet was used three days ago, so these powers are not dormant.',title:'Admin key was used 3 days ago',detail:'The admin wallet is active, so the upgrade power is not dormant.',where:'admin wallet history'}]}
];
const SEV_W={high:.4,med:.18,low:.06,ok:0,info:0};
const SEV_ORDER={high:0,med:1,low:2,ok:3,info:4};
function scoreOf(c){let p=1;c.findings.forEach(f=>{p*=1-(SEV_W[f.sev]||0);});return Math.round((1-p)*100);}
function verdictOf(score){
  if(score<20)return {action:'Looks okay to use',label:'No major red flags found',color:'#4fb5e6',text:'Nothing in this scan points to a serious problem. That is not a guarantee: no scan can prove a contract is safe.'};
  if(score<65)return {action:'Be careful',label:'Use caution',color:'#f5b83d',text:'There are powers or gaps that could hurt you. Read the findings before sending funds.'};
  return {action:'Avoid this one',label:'Unsafe signals found',color:'#ff5a45',text:'Several findings match patterns used to trap or drain users. Avoid interacting unless you can explain every one.'};
}
//#CONTRACTS_END
