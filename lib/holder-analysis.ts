import { callArcRpcBatch, parseRpcBigInt } from '@/lib/arc-rpc'
import { formatTokenAmount, ZERO_ADDRESS, type TransferEvidence } from '@/lib/token-analysis'

const DEAD_ADDRESS = '0x000000000000000000000000000000000000dead'
const CANDIDATE_LIMIT = 25
const BUNDLE_BLOCK_SPAN = 5
const MIN_BUNDLE_RECIPIENTS = 3
const CLUSTERS_CHECKED = 8
const MEMBERS_PER_CLUSTER = 40
const CLUSTERS_RETURNED = 5
const WHALES_RETURNED = 10
const BUBBLES_RETURNED = 50
const CODE_CHECKS = 30
const LINKS_RETURNED = 120

export type HolderAnalysis = {
  basis: string
  addressesSeen: number
  walletsChecked: number
  top10Pct: number | null
  whales: Array<{ address: string; balance: string; pct: number | null; isContract: boolean | null; clusterId: number | null }>
  bubbles: Array<{ address: string; balance: string; pct: number | null; share: number; isContract: boolean | null; clusterId: number | null }>
  links: Array<{ source: string; target: string; kind: 'transfer' | 'funding'; transferCount: number }>
  clusters: Array<{
    id: number
    memberCount: number
    membersChecked: number
    funder: string | null
    combinedBalance: string
    combinedPct: number | null
    fromBlock: number
    toBlock: number
    evidence: string
    members: string[]
  }>
}

type Bundle = { funder: string | null; recipients: Set<string>; fromBlock: number; toBlock: number; txs: Set<string> }

const pct = (part: bigint, whole: bigint | null) => (whole && whole > BigInt(0) ? Number((part * BigInt(10_000)) / whole) / 100 : null)

// Finds whale wallets and groups of wallets that look linked, using only the Transfer events
// already read for the scan plus live balanceOf calls. Linking is a heuristic: wallets that
// one sender (or one mint) funded together within a few blocks are treated as a bundle, and
// bundles that share a wallet are merged into a cluster.
export async function analyzeHolders(input: {
  token: string
  events: TransferEvidence[]
  totalSupply: bigint | null
  decimals: number | null
  blockTag: string
}): Promise<HolderAnalysis> {
  const { token, events, totalSupply, decimals, blockTag } = input
  const excluded = new Set([ZERO_ADDRESS, DEAD_ADDRESS, token.toLowerCase()])
  const fmt = (value: bigint) => formatTokenAmount(value, decimals ?? 0)

  const received = new Map<string, bigint>()
  const seen = new Set<string>()
  for (const event of events) {
    if (!excluded.has(event.to)) {
      received.set(event.to, (received.get(event.to) ?? BigInt(0)) + event.amount)
      seen.add(event.to)
    }
    if (!excluded.has(event.from)) seen.add(event.from)
  }

  // Bundles: one sender (or the mint) paying 3+ different wallets inside a few blocks.
  const groups = new Map<string, { funder: string | null; blockBucket: number; items: TransferEvidence[] }>()
  for (const event of events) {
    if (event.to === ZERO_ADDRESS || excluded.has(event.to)) continue
    const funder = event.from === ZERO_ADDRESS ? null : event.from
    if (funder && excluded.has(funder)) continue
    const bucket = Math.floor(event.blockNumber / BUNDLE_BLOCK_SPAN)
    const key = `${funder ?? 'mint'}:${bucket}`
    const group = groups.get(key) ?? { funder, blockBucket: bucket, items: [] }
    group.items.push(event)
    groups.set(key, group)
  }
  const bundles: Bundle[] = []
  for (const group of groups.values()) {
    const recipients = new Set(group.items.map((item) => item.to))
    if (recipients.size < MIN_BUNDLE_RECIPIENTS) continue
    bundles.push({
      funder: group.funder,
      recipients,
      fromBlock: Math.min(...group.items.map((item) => item.blockNumber)),
      toBlock: Math.max(...group.items.map((item) => item.blockNumber)),
      txs: new Set(group.items.map((item) => item.transactionHash)),
    })
  }

  // Merge bundles that share any wallet into clusters (union-find over wallets).
  const parent = new Map<string, string>()
  const find = (value: string): string => {
    let root = value
    while ((parent.get(root) ?? root) !== root) root = parent.get(root) as string
    parent.set(value, root)
    return root
  }
  const union = (a: string, b: string) => {
    if (!parent.has(a)) parent.set(a, a)
    if (!parent.has(b)) parent.set(b, b)
    parent.set(find(a), find(b))
  }
  for (const bundle of bundles) {
    const members = [...bundle.recipients, ...(bundle.funder ? [bundle.funder] : [])]
    members.forEach((member) => union(members[0], member))
  }
  const components = new Map<string, { members: Set<string>; bundles: Bundle[] }>()
  for (const bundle of bundles) {
    const members = [...bundle.recipients, ...(bundle.funder ? [bundle.funder] : [])]
    const root = find(members[0])
    const entry = components.get(root) ?? { members: new Set<string>(), bundles: [] }
    members.forEach((member) => entry.members.add(member))
    entry.bundles.push(bundle)
    components.set(root, entry)
  }
  const rankedComponents = [...components.values()].sort((a, b) => b.members.size - a.members.size).slice(0, CLUSTERS_CHECKED)

  // Live balances for the biggest receivers and for every wallet in the biggest clusters.
  const candidates = [...received.entries()].sort((a, b) => (a[1] > b[1] ? -1 : a[1] < b[1] ? 1 : 0)).slice(0, CANDIDATE_LIMIT).map(([address]) => address)
  const toCheck = new Set<string>(candidates)
  for (const component of rankedComponents) [...component.members].slice(0, MEMBERS_PER_CLUSTER).forEach((member) => toCheck.add(member))

  const balances = new Map<string, bigint>()
  const addressesToCheck = [...toCheck]
  const balanceResults = await callArcRpcBatch<string>(addressesToCheck.map((address) => ({
    method: 'eth_call',
    params: [{ to: token, data: `0x70a08231${address.slice(2).padStart(64, '0')}` }, blockTag],
  })))
  addressesToCheck.forEach((address, index) => {
    const value = parseRpcBigInt(balanceResults[index])
    if (value !== null) balances.set(address, value)
  })

  const clusters = rankedComponents.map((component) => {
    const members = [...component.members]
    const checked = members.slice(0, MEMBERS_PER_CLUSTER).filter((member) => balances.has(member))
    const combined = checked.reduce((sum, member) => sum + (balances.get(member) ?? BigInt(0)), BigInt(0))
    const funderCounts = new Map<string, number>()
    component.bundles.forEach((bundle) => { if (bundle.funder) funderCounts.set(bundle.funder, (funderCounts.get(bundle.funder) ?? 0) + 1) })
    const funder = [...funderCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    const txCount = new Set(component.bundles.flatMap((bundle) => [...bundle.txs])).size
    const fromBlock = Math.min(...component.bundles.map((bundle) => bundle.fromBlock))
    const toBlock = Math.max(...component.bundles.map((bundle) => bundle.toBlock))
    const evidence = funder
      ? `${funder.slice(0, 8)}…${funder.slice(-4)} paid ${members.length - 1} linked wallets across ${component.bundles.length} distribution${component.bundles.length === 1 ? '' : 's'} (${txCount} transaction${txCount === 1 ? '' : 's'}).`
      : `${members.length} wallets were minted to together across ${component.bundles.length} mint${component.bundles.length === 1 ? '' : 's'} (${txCount} transaction${txCount === 1 ? '' : 's'}).`
    return { members, checked: checked.length, combined, funder, fromBlock, toBlock, evidence }
  }).sort((a, b) => (a.combined > b.combined ? -1 : a.combined < b.combined ? 1 : b.members.length - a.members.length)).slice(0, CLUSTERS_RETURNED)

  const clusterOf = new Map<string, number>()
  clusters.forEach((cluster, index) => cluster.members.forEach((member) => { if (!clusterOf.has(member)) clusterOf.set(member, index + 1) }))

  const holdersRanked = [...balances.entries()].filter(([, balance]) => balance > BigInt(0)).sort((a, b) => (a[1] > b[1] ? -1 : a[1] < b[1] ? 1 : 0))
  const ranked = holdersRanked.slice(0, WHALES_RETURNED)
  const bubbleNodes = holdersRanked.slice(0, BUBBLES_RETURNED)
  const codeTargets = bubbleNodes.slice(0, CODE_CHECKS).map(([address]) => address)
  const codeBatch = await callArcRpcBatch<string>(codeTargets.map((address) => ({ method: 'eth_getCode', params: [address, blockTag] })))
  const codeResults = codeBatch.map((code) => (typeof code === 'string' ? code !== '0x' : null))
  const isContractBy = new Map(codeTargets.map((address, index) => [address, codeResults[index]]))

  // Links between the displayed wallets: direct transfers seen in the window, plus funding
  // relationships from the bundles above.
  const nodeSet = new Set(bubbleNodes.map(([address]) => address))
  const pairs = new Map<string, { source: string; target: string; count: number; amount: bigint; funding: boolean }>()
  for (const event of events) {
    if (event.from === event.to || !nodeSet.has(event.from) || !nodeSet.has(event.to)) continue
    const key = `${event.from}>${event.to}`
    const pair = pairs.get(key) ?? { source: event.from, target: event.to, count: 0, amount: BigInt(0), funding: false }
    pair.count += 1
    pair.amount += event.amount
    pairs.set(key, pair)
  }
  for (const bundle of bundles) {
    if (!bundle.funder || !nodeSet.has(bundle.funder)) continue
    for (const recipient of bundle.recipients) {
      if (!nodeSet.has(recipient) || recipient === bundle.funder) continue
      const key = `${bundle.funder}>${recipient}`
      const pair = pairs.get(key) ?? { source: bundle.funder, target: recipient, count: 0, amount: BigInt(0), funding: false }
      pair.funding = true
      pairs.set(key, pair)
    }
  }
  const links = [...pairs.values()]
    .sort((a, b) => Number(b.funding) - Number(a.funding) || b.count - a.count || (a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : 0))
    .slice(0, LINKS_RETURNED)
  const biggest = bubbleNodes[0]?.[1] ?? BigInt(1)
  const codes = ranked.map(([address]) => isContractBy.get(address) ?? null)
  const top10 = ranked.reduce((sum, [, balance]) => sum + balance, BigInt(0))

  return {
    basis: `Built from up to ${events.length.toLocaleString('en-US')} transfers in the scan window plus live balances at the latest block. Only wallets that appear in those transfers are examined, so holders that were inactive in the window are not counted.`,
    addressesSeen: seen.size,
    walletsChecked: balances.size,
    top10Pct: pct(top10, totalSupply),
    whales: ranked.map(([address, balance], index) => ({
      address,
      balance: fmt(balance),
      pct: pct(balance, totalSupply),
      isContract: codes[index],
      clusterId: clusterOf.get(address) ?? null,
    })),
    bubbles: bubbleNodes.map(([address, balance]) => ({
      address,
      balance: fmt(balance),
      pct: pct(balance, totalSupply),
      share: Number((balance * BigInt(10_000)) / biggest) / 10_000,
      isContract: isContractBy.get(address) ?? null,
      clusterId: clusterOf.get(address) ?? null,
    })),
    links: links.map((link) => ({ source: link.source, target: link.target, kind: link.funding ? 'funding' as const : 'transfer' as const, transferCount: link.count })),
    clusters: clusters.map((cluster, index) => ({
      id: index + 1,
      memberCount: cluster.members.length,
      membersChecked: cluster.checked,
      funder: cluster.funder,
      combinedBalance: fmt(cluster.combined),
      combinedPct: pct(cluster.combined, totalSupply),
      fromBlock: cluster.fromBlock,
      toBlock: cluster.toBlock,
      evidence: cluster.evidence,
      members: cluster.members.slice(0, 10),
    })),
  }
}
