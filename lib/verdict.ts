import type { ContractScan, TokenScan } from '@/lib/schemas'

// Turns technical scan output into a plain-language verdict for people who do not read
// blockchain data. It never says "safe": it reports what was and was not found.

export type VerdictLevel = 'ok' | 'careful' | 'high' | 'unknown'
export type ReasonTone = 'good' | 'warn' | 'bad' | 'info'
export type Reason = { tone: ReasonTone; text: string; terms?: string[] }
export type Verdict = {
  level: VerdictLevel
  headline: string
  summary: string
  reasons: Reason[]
  nextSteps: string[]
  suggestDeepScan: boolean
}

export const GLOSSARY: Record<string, string> = {
  bundle: 'A bundle is when one source sends tokens to many wallets at nearly the same moment. Teams sometimes do this to look like many separate buyers while one party really controls them.',
  cluster: 'A cluster is a group of wallets that look connected, for example because the same sender funded them together. It is a clue, not proof that one person owns them.',
  whale: 'A whale is a wallet that holds a very large share of a token. If a whale sells, the price can drop sharply.',
  mint: 'Minting means creating brand new tokens. If someone can mint without limits, your share of the supply can shrink.',
  pause: 'A pause control lets someone freeze transfers. That can protect users in an emergency, but it also means someone can stop you from moving your tokens.',
  blacklist: 'A blacklist lets someone block specific wallets from sending or receiving the token.',
  upgrade: 'An upgradeable contract can have its code replaced later. The people who control the upgrade can change how it behaves, even after you have used it.',
  owner: 'The owner is an address with special admin powers over a contract. One owner means one party can make changes.',
  multisig: 'A multi-signature wallet needs several people to approve an action, which is safer than a single person holding the keys.',
  timelock: 'A timelock forces a waiting period before a change takes effect, so users can see it coming and leave.',
  contract: 'A contract is a program that lives on the blockchain. A wallet is controlled by a person. Large holdings in a contract are often normal, like a trading pool.',
}

const HEADLINES: Record<VerdictLevel, string> = {
  ok: 'No major red flags found',
  careful: 'Be careful',
  high: 'High risk',
  unknown: 'Not enough information',
}

const SUMMARIES: Record<VerdictLevel, string> = {
  ok: 'We looked at the public Arc data we can see and nothing stood out as a clear warning sign.',
  careful: 'We found things worth a closer look before you put money in.',
  high: 'We found several warning signs. Treat this with a lot of caution.',
  unknown: 'There is too little activity or data to say anything useful yet.',
}

const NEXT_STEPS: Record<VerdictLevel, string[]> = {
  ok: ['No red flags is not the same as safe. Only use money you can afford to lose.', 'Check the project from other places too, like its official website and community.'],
  careful: ['If you still want to interact, start with a very small amount.', 'Check who runs the project and whether the warning signs above have an explanation.'],
  high: ['Avoid putting in money you cannot afford to lose.', 'If someone is pushing you to buy quickly, slow down and check independently.'],
  unknown: ['Come back after the token has more activity, or run a deep scan for more detail.', 'Do not rely on this result alone.'],
}

const pct = (value: number | null | undefined) => (value === null || value === undefined ? null : value >= 10 ? value.toFixed(0) : value.toFixed(1))

function finish(reasons: Reason[], floor: VerdictLevel, enoughData: boolean, suggestDeepScan: boolean): Verdict {
  const bad = reasons.some((reason) => reason.tone === 'bad')
  const warn = reasons.some((reason) => reason.tone === 'warn')
  let level: VerdictLevel = bad ? 'high' : warn ? 'careful' : enoughData ? 'ok' : 'unknown'
  const rank: Record<VerdictLevel, number> = { unknown: 0, ok: 1, careful: 2, high: 3 }
  if (rank[floor] > rank[level] && floor !== 'unknown') level = floor
  const order: Record<ReasonTone, number> = { bad: 0, warn: 1, info: 2, good: 3 }
  return {
    level,
    headline: HEADLINES[level],
    summary: SUMMARIES[level],
    reasons: [...reasons].sort((a, b) => order[a.tone] - order[b.tone]),
    nextSteps: NEXT_STEPS[level],
    suggestDeepScan,
  }
}

const CAPABILITY_TEXT: Record<string, { text: string; term: string }> = {
  'Mint function': { text: 'The token code can create new tokens. If the controller uses it, your share of the supply shrinks.', term: 'mint' },
  'Pause control': { text: 'The token code includes a pause switch, so someone could freeze transfers.', term: 'pause' },
  'Blacklist control': { text: 'The token code can block specific wallets from using the token.', term: 'blacklist' },
  'Upgrade function': { text: 'The code can be replaced later, so the controller could change how the token works.', term: 'upgrade' },
  'Role-based access': { text: 'Some functions are limited to special roles. Who holds those roles is not shown here.', term: 'owner' },
}

export function tokenVerdict(result: TokenScan): Verdict {
  const reasons: Reason[] = []
  const { assessment, metrics, coverage } = result
  const hasDeep = Boolean(result.deep)

  for (const signal of assessment.signals) {
    const tone: ReasonTone = signal.severity === 'high' ? 'bad' : signal.severity === 'medium' ? 'warn' : 'info'
    switch (signal.id) {
      case 'recent-mint': {
        const share = pct(metrics.mintedSupplyPct)
        reasons.push({
          tone,
          text: tone === 'info'
            ? 'A small amount of new tokens was created recently. That is usually routine.'
            : share ? `New tokens equal to about ${share}% of the supply were created recently. More tokens in circulation can lower the value of the ones people already hold.` : 'New tokens were created recently.',
          terms: ['mint'],
        })
        break
      }
      case 'large-transfer': {
        const share = pct(metrics.largestTransferPct)
        reasons.push({ tone, text: share ? `A single transfer moved about ${share}% of everything that moved lately. Very large moves can come from someone preparing to sell.` : 'One very large transfer stood out.' })
        break
      }
      case 'recipient-concentration': {
        const share = pct(metrics.topRecipientSharePct)
        reasons.push({ tone, text: share ? `One wallet received about ${share}% of the tokens that moved recently, so activity is concentrated.` : 'Recent activity is concentrated in very few wallets.', terms: ['whale'] })
        break
      }
      case 'shared-source-cluster':
        reasons.push({ tone: tone === 'info' ? 'warn' : tone, text: 'Several wallets were funded by the same source with similar amounts within minutes. This pattern is often a bundle.', terms: ['bundle', 'cluster'] })
        break
      case 'same-block-burst':
        reasons.push({ tone: 'info', text: 'Many transfers happened inside the same block or transaction. That can be normal batching, or a bundled launch.', terms: ['bundle'] })
        break
      case 'circular-flow':
        reasons.push({ tone: 'warn', text: 'Tokens moved around in a loop between three wallets. Loops like this are sometimes used to fake trading activity.' })
        break
      default:
        reasons.push({ tone, text: signal.title })
    }
  }

  const holders = result.deep?.holders
  if (holders) {
    const wallets = holders.whales.filter((whale) => whale.isContract !== true)
    const walletShare = wallets.reduce((sum, whale) => sum + (whale.pct ?? 0), 0)
    if (holders.whales.length > 0 && holders.top10Pct !== null) {
      if (walletShare >= 50) reasons.push({ tone: 'bad', text: `The ${wallets.length} largest wallets hold about ${pct(walletShare)}% of the supply we could see, excluding contracts. If a few of them sell, the price can collapse.`, terms: ['whale'] })
      else if (walletShare >= 25) reasons.push({ tone: 'warn', text: `The ${wallets.length} largest wallets hold about ${pct(walletShare)}% of the supply we could see, excluding contracts.`, terms: ['whale'] })
      else reasons.push({ tone: 'good', text: `The supply looks fairly spread out: the ten biggest holders have about ${pct(holders.top10Pct)}%, and much of that may sit in contracts.`, terms: ['contract'] })
    }
    for (const cluster of holders.clusters.slice(0, 3)) {
      const share = cluster.combinedPct ?? 0
      if (share >= 25) reasons.push({ tone: 'bad', text: `A group of ${cluster.memberCount} linked wallets (cluster ${cluster.id}) holds about ${pct(share)}% of the supply. If one party controls them, they control a large part of the token.`, terms: ['cluster'] })
      else if (share >= 8) reasons.push({ tone: 'warn', text: `A group of ${cluster.memberCount} linked wallets (cluster ${cluster.id}) holds about ${pct(share)}% of the supply.`, terms: ['cluster'] })
      else if (cluster.memberCount >= 3) reasons.push({ tone: 'info', text: `A group of ${cluster.memberCount} wallets was funded together (cluster ${cluster.id}), but together they hold only about ${pct(share) ?? 'a small'}% of the supply.`, terms: ['cluster'] })
    }
  }

  if (result.deep) {
    const review = result.deep.capabilities.filter((item) => item.severity === 'review' && CAPABILITY_TEXT[item.label])
    if (review.length === 0) reasons.push({ tone: 'good', text: 'We did not find mint, pause, blacklist or upgrade controls in the token code.' })
    for (const item of review) {
      const entry = CAPABILITY_TEXT[item.label]
      reasons.push({ tone: 'warn', text: entry.text, terms: [entry.term] })
    }
    for (const bundle of result.bundleSignals.slice(0, 1)) {
      reasons.push({ tone: 'warn', text: `At block ${bundle.blockNumber.toLocaleString('en-US')}, one source sent tokens to ${bundle.recipientCount} wallets at once. That is a bundle pattern.`, terms: ['bundle'] })
    }
  }

  const enoughData = assessment.level !== 'insufficient' && coverage.transferEventsAnalyzed > 0
  if (assessment.level === 'insufficient') reasons.push({ tone: 'info', text: 'There were hardly any transfers lately, so there is not much to judge.' })
  else if (reasons.length === 0) reasons.push({ tone: 'good', text: `Nothing unusual showed up in ${coverage.transferEventsAnalyzed.toLocaleString('en-US')} recent transfers.` })
  else if (!reasons.some((reason) => reason.tone === 'bad' || reason.tone === 'warn') && !hasDeep) reasons.push({ tone: 'good', text: `Recent activity (${coverage.transferEventsAnalyzed.toLocaleString('en-US')} transfers) did not show unusual patterns.` })

  const floor: VerdictLevel = assessment.level === 'elevated' ? 'high' : assessment.level === 'review' ? 'careful' : 'unknown'
  const verdict = finish(reasons, floor, enoughData || hasDeep, !hasDeep)
  if (!hasDeep) verdict.nextSteps = [...verdict.nextSteps, 'Run a deep scan to see the biggest wallets, linked wallets, bundles and admin controls.']
  return verdict
}

export function contractVerdict(result: ContractScan): Verdict {
  const reasons: Reason[] = []
  const { contract } = result
  const surface = contract.controlSurface
  const hasDeep = Boolean(result.deep)

  if (contract.pauseStatus === 'paused') reasons.push({ tone: 'bad', text: 'This contract is paused right now, so it may not work as normal.', terms: ['pause'] })

  const upgradeable = contract.proxy.kind === 'eip1967' || contract.proxy.kind === 'eip1167'
  const protectedByTimelock = surface.timelockMinDelaySeconds !== null && surface.timelockMinDelaySeconds > 0
  const multisig = surface.safeThreshold !== null && surface.safeOwners.length > 1
  if (upgradeable) {
    reasons.push({
      tone: protectedByTimelock || multisig ? 'info' : 'warn',
      text: contract.proxy.kind === 'eip1967'
        ? 'The code behind this contract can be swapped by an admin. Its behaviour could change after you use it.'
        : 'This contract is a lightweight copy that points at other code. Check what that code does.',
      terms: ['upgrade'],
    })
  } else if (contract.proxy.kind === 'none_detected' && !surface.selectorCandidates.some((candidate) => candidate.category === 'upgrade')) {
    reasons.push({ tone: 'good', text: 'We did not detect a common upgrade mechanism, so the code is less likely to be swapped later.' })
  }

  if (contract.ownerStatus === 'active') reasons.push({ tone: multisig ? 'info' : 'warn', text: multisig ? 'An owner address has admin powers, and it is a shared wallet that needs several approvals.' : 'A single owner address has special admin powers over this contract.', terms: multisig ? ['owner', 'multisig'] : ['owner'] })
  else if (contract.ownerStatus === 'renounced') reasons.push({ tone: 'good', text: 'The owner role appears to be given up, so no one holds the usual owner powers.', terms: ['owner'] })

  if (multisig) reasons.push({ tone: 'good', text: `Admin actions appear to need ${surface.safeThreshold} of ${surface.safeOwners.length} approvals, which is safer than one person holding the keys.`, terms: ['multisig'] })
  if (surface.timelockMinDelaySeconds !== null) {
    if (surface.timelockMinDelaySeconds > 0) reasons.push({ tone: 'good', text: `Changes appear to wait at least ${Math.max(1, Math.round(surface.timelockMinDelaySeconds / 3600))} hour(s) before they take effect, giving users time to react.`, terms: ['timelock'] })
    else reasons.push({ tone: 'warn', text: 'A timelock exists but has no waiting time, so changes could happen instantly.', terms: ['timelock'] })
  }

  const seen = new Set<string>()
  for (const candidate of surface.selectorCandidates) {
    if (candidate.severity !== 'review' || seen.has(candidate.category)) continue
    seen.add(candidate.category)
    const text = candidate.category === 'issuance' ? 'The code appears to include a way to create new tokens.'
      : candidate.category === 'availability' ? 'The code appears to include a pause switch.'
      : candidate.category === 'access control' ? 'The code appears to hand out special roles with extra powers.'
      : candidate.category === 'upgrade' ? 'The code appears to include a way to change the contract later.'
      : candidate.title
    const term = candidate.category === 'issuance' ? 'mint' : candidate.category === 'availability' ? 'pause' : candidate.category === 'upgrade' ? 'upgrade' : 'owner'
    if (!(candidate.category === 'upgrade' && upgradeable)) reasons.push({ tone: 'warn', text, terms: [term] })
  }

  if (result.deep) {
    const extras = result.deep.capabilities.filter((item) => item.severity === 'review' && CAPABILITY_TEXT[item.label])
    for (const item of extras) {
      const entry = CAPABILITY_TEXT[item.label]
      if (!reasons.some((reason) => reason.terms?.includes(entry.term))) reasons.push({ tone: 'warn', text: entry.text, terms: [entry.term] })
    }
    if (extras.length === 0) reasons.push({ tone: 'good', text: 'The deep check found no mint, pause, blacklist or upgrade controls in the code.' })
    if (result.deep.opcodes.selfdestruct) reasons.push({ tone: 'warn', text: 'The code contains an instruction that can permanently remove it from the chain.' })
  }

  if (reasons.length === 0) reasons.push({ tone: 'info', text: 'We could read the contract but found few public details about who controls it.' })
  const hasEvidence = contract.bytecodeBytes > 0 && (contract.proxy.kind !== 'unknown' || contract.ownerStatus !== 'not_exposed' || hasDeep)
  const verdict = finish(reasons, 'unknown', hasEvidence, !hasDeep)
  if (!hasDeep) verdict.nextSteps = [...verdict.nextSteps, 'Run a deep scan for a closer look at the code, including admin controls hidden inside upgradeable contracts.']
  return verdict
}
