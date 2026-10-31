export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export type TransferEvidence = {
  blockNumber: number
  transactionHash: string
  logIndex: number
  from: string
  to: string
  amount: bigint
}

function percentage(part: bigint, whole: bigint): number | null {
  if (whole <= BigInt(0)) return null
  return Number((part * BigInt(10_000)) / whole) / 100
}

function adjustCount<K>(counts: Map<K, number>, key: K, change: number) {
  const next = (counts.get(key) ?? 0) + change
  if (next <= 0) counts.delete(key)
  else counts.set(key, next)
}

function mostFrequentCount(counts: Map<bigint, number>) {
  let highest = 0
  for (const count of counts.values()) highest = Math.max(highest, count)
  return highest
}

function amountMatchesWithinTwentyPercent(left: bigint, right: bigint) {
  if (left <= BigInt(0) || right <= BigInt(0)) return false
  const larger = left > right ? left : right
  const smaller = left > right ? right : left
  return larger * BigInt(100) <= smaller * BigInt(120)
}

function lowerBoundBlock(events: TransferEvidence[], blockNumber: number) {
  let low = 0
  let high = events.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (events[middle].blockNumber < blockNumber) low = middle + 1
    else high = middle
  }
  return low
}

function analyzeSharedSourceClusters(events: TransferEvidence[], totalSupply: bigint | null, decimals: number | null) {
  const bySource = new Map<string, TransferEvidence[]>()
  for (const event of events) {
    if (event.from === ZERO_ADDRESS || event.to === ZERO_ADDRESS || event.from === event.to) continue
    const sourceEvents = bySource.get(event.from) ?? []
    sourceEvents.push(event)
    bySource.set(event.from, sourceEvents)
  }

  const clusters = []
  for (const [sourceAddress, sourceEvents] of bySource) {
    sourceEvents.sort((left, right) => left.blockNumber - right.blockNumber || left.logIndex - right.logIndex)
    const recipients = new Map<string, number>()
    const amounts = new Map<bigint, number>()
    const transactions = new Map<string, number>()
    let left = 0
    let transferCount = 0
    let grossAmount = BigInt(0)
    let best: {
      firstBlock: number
      lastBlock: number
      recipientCount: number
      transferCount: number
      transactionCount: number
      matchingAmountPct: number
      grossAmount: bigint
      walletAddresses: string[]
    } | null = null

    for (let right = 0; right < sourceEvents.length; right += 1) {
      const event = sourceEvents[right]
      adjustCount(recipients, event.to, 1)
      adjustCount(amounts, event.amount, 1)
      adjustCount(transactions, event.transactionHash, 1)
      transferCount += 1
      grossAmount += event.amount

      while (event.blockNumber - sourceEvents[left].blockNumber > 15) {
        const expired = sourceEvents[left]
        adjustCount(recipients, expired.to, -1)
        adjustCount(amounts, expired.amount, -1)
        adjustCount(transactions, expired.transactionHash, -1)
        transferCount -= 1
        grossAmount -= expired.amount
        left += 1
      }

      const isWindowEnd = right === sourceEvents.length - 1 || sourceEvents[right + 1].blockNumber > event.blockNumber
      if (!isWindowEnd || recipients.size < 5) continue

      const matchingAmountPct = transferCount === 0 ? 0 : Math.round((mostFrequentCount(amounts) / transferCount) * 100)
      if (matchingAmountPct < 50) continue

      const firstBlock = sourceEvents[left].blockNumber
      const candidateIsStronger = !best
        || recipients.size > best.recipientCount
        || (recipients.size === best.recipientCount && matchingAmountPct > best.matchingAmountPct)
      if (!candidateIsStronger) continue

      best = {
        firstBlock,
        lastBlock: event.blockNumber,
        recipientCount: recipients.size,
        transferCount,
        transactionCount: transactions.size,
        matchingAmountPct,
        grossAmount,
        walletAddresses: [...recipients.keys()],
      }
    }

    if (!best) continue

    const walletSet = new Set(best.walletAddresses)
    const exitSenders = new Map<string, Set<string>>()
    for (const event of events) {
      if (!walletSet.has(event.from) || walletSet.has(event.to) || event.to === ZERO_ADDRESS) continue
      if (event.blockNumber < best.firstBlock || event.blockNumber > best.lastBlock + 50) continue
      const senders = exitSenders.get(event.to) ?? new Set<string>()
      senders.add(event.from)
      exitSenders.set(event.to, senders)
    }

    let commonExitAddress: string | null = null
    let commonExitWalletCount = 0
    for (const [exitAddress, senders] of exitSenders) {
      if (senders.size > commonExitWalletCount) {
        commonExitAddress = exitAddress
        commonExitWalletCount = senders.size
      }
    }
    if (commonExitWalletCount < 3) {
      commonExitAddress = null
      commonExitWalletCount = 0
    }

    const evidence = [
      `${best.recipientCount} recipient wallets received this token from the same address within ${best.lastBlock - best.firstBlock} blocks.`,
      `${best.matchingAmountPct}% of those transfer events matched the most common exact amount.`,
    ]
    if (commonExitAddress) evidence.push(`${commonExitWalletCount} of those wallets later sent the token to the same address.`)

    clusters.push({
      id: `source-${sourceAddress}`,
      sourceAddress,
      sampleAddresses: best.walletAddresses.slice(0, 8),
      recipientCount: best.recipientCount,
      transferCount: best.transferCount,
      transactionCount: best.transactionCount,
      firstBlock: best.firstBlock,
      lastBlock: best.lastBlock,
      matchingAmountPct: best.matchingAmountPct,
      grossTransferAmount: decimals === null ? null : formatTokenAmount(best.grossAmount, decimals),
      grossSupplySharePct: totalSupply === null ? null : percentage(best.grossAmount, totalSupply),
      commonExitAddress,
      commonExitWalletCount,
      evidence,
      severity: best.recipientCount >= 8 && best.matchingAmountPct >= 75 && commonExitAddress ? 'medium' as const : 'info' as const,
    })
  }

  return clusters
    .sort((left, right) => right.recipientCount - left.recipientCount || right.matchingAmountPct - left.matchingAmountPct)
    .slice(0, 5)
}

function analyzeSameBlockBursts(events: TransferEvidence[]) {
  const byBlockAndSource = new Map<string, TransferEvidence[]>()
  for (const event of events) {
    if (event.from === ZERO_ADDRESS || event.to === ZERO_ADDRESS || event.from === event.to) continue
    const key = `${event.blockNumber}:${event.from}`
    const group = byBlockAndSource.get(key) ?? []
    group.push(event)
    byBlockAndSource.set(key, group)
  }

  return [...byBlockAndSource.entries()]
    .map(([key, group]) => {
      const recipients = new Set(group.map((event) => event.to))
      const transactions = new Set(group.map((event) => event.transactionHash))
      if (recipients.size < 3 || (transactions.size !== 1 && transactions.size < 3)) return null
      const amounts = new Map<bigint, number>()
      for (const event of group) adjustCount(amounts, event.amount, 1)
      const matchingAmountPct = Math.round((mostFrequentCount(amounts) / group.length) * 100)
      const [blockValue, sourceAddress] = key.split(':')
      const blockNumber = Number(blockValue)
      const kind = transactions.size === 1 ? 'single_transaction_fanout' as const : 'same_block_burst' as const
      const evidence = kind === 'single_transaction_fanout'
        ? `One transaction sent this token to ${recipients.size} distinct addresses in block ${blockNumber}. This is a batched transfer, not proof of shared ownership.`
        : `${transactions.size} transactions from one token source reached ${recipients.size} addresses in block ${blockNumber}. Same-block activity can be coordinated, but it does not prove a private bundle or shared ownership.`
      return {
        id: `${kind}-${blockNumber}-${sourceAddress}`,
        kind,
        blockNumber,
        sourceAddress,
        recipientCount: recipients.size,
        transactionCount: transactions.size,
        transferCount: group.length,
        matchingAmountPct,
        evidence,
      }
    })
    .filter((signal): signal is NonNullable<typeof signal> => signal !== null)
    .sort((left, right) => right.recipientCount - left.recipientCount || right.transferCount - left.transferCount)
    .slice(0, 8)
}

function analyzeCircularFlows(events: TransferEvidence[]) {
  const ordered = [...events]
    .filter((event) => event.from !== ZERO_ADDRESS && event.to !== ZERO_ADDRESS && event.from !== event.to)
    .sort((left, right) => left.blockNumber - right.blockNumber || left.logIndex - right.logIndex)
  const bySender = new Map<string, TransferEvidence[]>()
  for (const event of ordered) {
    const outgoing = bySender.get(event.from) ?? []
    outgoing.push(event)
    bySender.set(event.from, outgoing)
  }

  const cycles = new Map<string, { id: string; addresses: string[]; firstBlock: number; lastBlock: number; evidence: string }>()
  let probes = 0
  const maxProbes = 50_000

  for (const first of ordered) {
    const secondCandidates = bySender.get(first.to) ?? []
    const secondStart = lowerBoundBlock(secondCandidates, first.blockNumber)
    for (let secondIndex = secondStart; secondIndex < secondCandidates.length && secondIndex < secondStart + 12; secondIndex += 1) {
      const second = secondCandidates[secondIndex]
      if (second.blockNumber - first.blockNumber > 50 || probes >= maxProbes) break
      probes += 1
      if (second.to === first.from || second.to === first.to || !amountMatchesWithinTwentyPercent(first.amount, second.amount)) continue

      const thirdCandidates = bySender.get(second.to) ?? []
      const thirdStart = lowerBoundBlock(thirdCandidates, second.blockNumber)
      for (let thirdIndex = thirdStart; thirdIndex < thirdCandidates.length && thirdIndex < thirdStart + 12; thirdIndex += 1) {
        const third = thirdCandidates[thirdIndex]
        if (third.blockNumber - first.blockNumber > 50 || probes >= maxProbes) break
        probes += 1
        if (third.to !== first.from || !amountMatchesWithinTwentyPercent(first.amount, third.amount)) continue

        const addresses = [first.from, first.to, second.to]
        if (new Set(addresses).size !== 3) continue
        const canonicalAddresses = [
          `${addresses[0]}:${addresses[1]}:${addresses[2]}`,
          `${addresses[1]}:${addresses[2]}:${addresses[0]}`,
          `${addresses[2]}:${addresses[0]}:${addresses[1]}`,
        ].sort()[0]
        const id = `cycle-${canonicalAddresses}-${first.blockNumber}`
        if (cycles.has(id)) continue
        cycles.set(id, {
          id,
          addresses,
          firstBlock: first.blockNumber,
          lastBlock: third.blockNumber,
          evidence: `Three addresses transferred this token in a loop within ${third.blockNumber - first.blockNumber} blocks, with amounts within 20% of one another. This shows movement, not shared identity or intent.`,
        })
        if (cycles.size >= 8) break
      }
      if (cycles.size >= 8 || probes >= maxProbes) break
    }
    if (cycles.size >= 8 || probes >= maxProbes) break
  }

  return [...cycles.values()]
}

export function formatTokenAmount(amount: bigint, decimals: number): string {
  if (decimals === 0) return amount.toString()

  const digits = amount.toString().padStart(decimals + 1, '0')
  const whole = digits.slice(0, -decimals).replace(/^0+(?=\d)/, '')
  const fraction = digits.slice(-decimals).replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole
}

export function analyzeTokenTransfers(input: {
  events: TransferEvidence[]
  totalObserved: number
  invalidEvents: number
  fromBlock: number
  toBlock: number
  totalSupply: bigint | null
  decimals: number | null
  includeLinkage?: boolean
}) {
  const { events, totalObserved, invalidEvents, fromBlock, toBlock, totalSupply, decimals } = input
  const senders = new Set<string>()
  const recipients = new Set<string>()
  const activeAddresses = new Set<string>()
  const recipientAmounts = new Map<string, bigint>()
  let totalAmount = BigInt(0)
  let mintedAmount = BigInt(0)
  let burnedAmount = BigInt(0)
  let largestTransfer = BigInt(0)
  let inboundAmount = BigInt(0)

  for (const event of events) {
    totalAmount += event.amount
    if (event.amount > largestTransfer) largestTransfer = event.amount

    if (event.from === ZERO_ADDRESS) mintedAmount += event.amount
    else {
      senders.add(event.from)
      activeAddresses.add(event.from)
    }

    if (event.to === ZERO_ADDRESS) burnedAmount += event.amount
    else {
      recipients.add(event.to)
      activeAddresses.add(event.to)
      inboundAmount += event.amount
      recipientAmounts.set(event.to, (recipientAmounts.get(event.to) ?? BigInt(0)) + event.amount)
    }
  }

  let topRecipient: string | null = null
  let topRecipientAmount = BigInt(0)
  for (const [address, amount] of recipientAmounts) {
    if (amount > topRecipientAmount) {
      topRecipient = address
      topRecipientAmount = amount
    }
  }

  const mintedSupplyPct = totalSupply && totalSupply > BigInt(0) ? percentage(mintedAmount, totalSupply) : null
  const largestTransferPct = percentage(largestTransfer, totalAmount)
  const topRecipientSharePct = percentage(topRecipientAmount, inboundAmount)
  // Wallet-linking analysis (clusters, bundles, circular flows) is a deep-scan feature.
  const includeLinkage = input.includeLinkage !== false
  const clusters = includeLinkage ? analyzeSharedSourceClusters(events, totalSupply, decimals) : []
  const bundleSignals = includeLinkage ? analyzeSameBlockBursts(events) : []
  const circularFlows = includeLinkage ? analyzeCircularFlows(events) : []
  const signals: Array<{ id: string; severity: 'high' | 'medium' | 'info'; title: string; evidence: string; points: number }> = []

  if (mintedAmount > BigInt(0)) {
    if (mintedSupplyPct === null) {
      signals.push({ id: 'recent-mint', severity: 'info', title: 'Recent mint events observed', evidence: `The scanned window contains ${decimals === null ? mintedAmount.toString() : formatTokenAmount(mintedAmount, decimals)} newly minted token units. Total supply or token decimals could not be read, so the relative supply change is unknown.`, points: 10 })
    } else if (mintedSupplyPct >= 10) {
      signals.push({ id: 'recent-mint', severity: 'high', title: 'Material recent minting observed', evidence: `Mint events in the scanned window equal ${mintedSupplyPct.toFixed(2)}% of the token's current reported supply. This is evidence of issuance, not proof of malicious intent.`, points: 40 })
    } else if (mintedSupplyPct >= 2) {
      signals.push({ id: 'recent-mint', severity: 'medium', title: 'Recent minting observed', evidence: `Mint events in the scanned window equal ${mintedSupplyPct.toFixed(2)}% of the token's current reported supply. Review who can mint and under what conditions.`, points: 25 })
    } else {
      signals.push({ id: 'recent-mint', severity: 'info', title: 'Small recent mint activity observed', evidence: `Mint events in the scanned window equal ${mintedSupplyPct.toFixed(2)}% of the token's current reported supply.`, points: 10 })
    }
  }

  if (events.length >= 3 && largestTransferPct !== null && largestTransferPct >= 25) {
    signals.push({
      id: 'large-transfer',
      severity: largestTransferPct >= 50 ? 'medium' : 'info',
      title: 'A large share of recent transfer volume moved in one event',
      evidence: `The largest single Transfer event accounts for ${largestTransferPct.toFixed(2)}% of the token amount moved in the scanned window. This measures recent flow, not current ownership.`,
      points: largestTransferPct >= 50 ? 15 : 8,
    })
  }

  if (recipients.size >= 4 && topRecipientSharePct !== null && topRecipientSharePct >= 50 && topRecipient) {
    signals.push({
      id: 'recipient-concentration',
      severity: topRecipientSharePct >= 75 ? 'medium' : 'info',
      title: 'Recent incoming transfers were concentrated',
      evidence: `One address (${topRecipient.slice(0, 8)}…${topRecipient.slice(-6)}) received ${topRecipientSharePct.toFixed(2)}% of non-burn transfer volume in this window. This is not a holder-balance or ownership calculation.`,
      points: topRecipientSharePct >= 75 ? 15 : 8,
    })
  }

  if (clusters.length) {
    const strongest = clusters[0]
    signals.push({
      id: 'shared-source-cluster',
      severity: strongest.severity,
      title: 'Possible linked distribution group',
      evidence: `${strongest.recipientCount} recipient wallets received matching amounts from one token source in a short block window. This is a wallet-linking clue, not proof of common ownership.`,
      points: strongest.severity === 'medium' ? 12 : 6,
    })
  }

  if (bundleSignals.length) {
    signals.push({
      id: 'same-block-burst',
      severity: 'info',
      title: 'Batched or same-block transfer activity observed',
      evidence: `${bundleSignals.length} same-transaction fan-out or same-block burst pattern${bundleSignals.length === 1 ? '' : 's'} appeared in the scanned window. A burst does not prove a private bundle or automated trading.`,
      points: 4,
    })
  }

  if (circularFlows.length) {
    signals.push({
      id: 'circular-flow',
      severity: 'info',
      title: 'Circular token movement observed',
      evidence: `${circularFlows.length} three-address transfer loop${circularFlows.length === 1 ? '' : 's'} with similar amounts appeared in the scanned window. This is movement evidence, not proof of wash trading or shared identity.`,
      points: 4,
    })
  }

  const score = Math.min(100, signals.reduce((sum, signal) => sum + signal.points, 0))
  const hasReviewSignal = signals.some((signal) => signal.severity === 'high' || signal.severity === 'medium')
  const level = events.length === 0 ? 'insufficient' : score >= 50 ? 'elevated' : hasReviewSignal ? 'review' : 'low'
  const label = {
    insufficient: 'Not enough recent transfer evidence',
    low: 'No major red flags found in this window',
    review: 'Use caution · review the linked signals',
    elevated: 'Several elevated signals need review',
  }[level]
  const sortedEvents = [...events].sort((left, right) => right.blockNumber - left.blockNumber || right.logIndex - left.logIndex)

  return {
    coverage: {
      fromBlock,
      toBlock,
      blockCount: Math.max(0, toBlock - fromBlock + 1),
      transferEventsObserved: totalObserved,
      transferEventsAnalyzed: events.length,
      invalidEvents,
      truncated: totalObserved - invalidEvents > events.length,
    },
    metrics: {
      transferCount: events.length,
      uniqueSenders: senders.size,
      uniqueRecipients: recipients.size,
      activeAddresses: activeAddresses.size,
      totalTransferAmount: decimals === null ? null : formatTokenAmount(totalAmount, decimals),
      mintedAmount: decimals === null ? null : formatTokenAmount(mintedAmount, decimals),
      burnedAmount: decimals === null ? null : formatTokenAmount(burnedAmount, decimals),
      mintedSupplyPct,
      largestTransferPct,
      topRecipientSharePct,
    },
    assessment: {
      score,
      level,
      label,
      signals: signals.map(({ points: _points, ...signal }) => signal),
      note: `This rule-based review covers blocks ${fromBlock}–${toBlock}. It does not establish current holder balances, liquidity, sellability, contract permissions, or safety. Shared-source, same-block, and circular-flow patterns are heuristics; they cannot prove wallet identity, bundle membership, or intent. No configured flag is not proof that a token is safe.`,
    },
    clusters,
    bundleSignals,
    circularFlows,
    transfers: sortedEvents.slice(0, 20).map((event) => ({
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
      from: event.from,
      to: event.to,
      type: event.from === ZERO_ADDRESS ? 'mint' as const : event.to === ZERO_ADDRESS ? 'burn' as const : 'transfer' as const,
      amount: decimals === null ? null : formatTokenAmount(event.amount, decimals),
      amountRaw: event.amount.toString(),
    })),
  }
}
