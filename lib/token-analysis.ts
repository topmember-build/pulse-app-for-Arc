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

    if (event.from === ZERO_ADDRESS) {
      mintedAmount += event.amount
    } else {
      senders.add(event.from)
      activeAddresses.add(event.from)
    }

    if (event.to === ZERO_ADDRESS) {
      burnedAmount += event.amount
    } else {
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
  const signals: Array<{ id: string; severity: 'high' | 'medium' | 'info'; title: string; evidence: string; points: number }> = []

  if (mintedAmount > BigInt(0)) {
    if (mintedSupplyPct === null) {
      signals.push({
        id: 'recent-mint', severity: 'info', title: 'Recent mint events observed',
        evidence: `The scanned window contains ${decimals === null ? mintedAmount.toString() : formatTokenAmount(mintedAmount, decimals)} newly minted token units. Total supply or token decimals could not be read, so the relative supply change is unknown.`,
        points: 10,
      })
    } else if (mintedSupplyPct >= 10) {
      signals.push({
        id: 'recent-mint', severity: 'high', title: 'Material recent minting observed',
        evidence: `Mint events in the scanned window equal ${mintedSupplyPct.toFixed(2)}% of the token's current reported supply. This is evidence of issuance, not proof of malicious intent.`,
        points: 40,
      })
    } else if (mintedSupplyPct >= 2) {
      signals.push({
        id: 'recent-mint', severity: 'medium', title: 'Recent minting observed',
        evidence: `Mint events in the scanned window equal ${mintedSupplyPct.toFixed(2)}% of the token's current reported supply. Review who can mint and under what conditions.`,
        points: 25,
      })
    } else {
      signals.push({
        id: 'recent-mint', severity: 'info', title: 'Small recent mint activity observed',
        evidence: `Mint events in the scanned window equal ${mintedSupplyPct.toFixed(2)}% of the token's current reported supply.`,
        points: 10,
      })
    }
  }

  if (events.length >= 3 && largestTransferPct !== null && largestTransferPct >= 25) {
    signals.push({
      id: 'large-transfer', severity: largestTransferPct >= 50 ? 'medium' : 'info',
      title: 'A large share of recent transfer volume moved in one event',
      evidence: `The largest single Transfer event accounts for ${largestTransferPct.toFixed(2)}% of the token amount moved in the scanned window. This measures recent flow, not current ownership.`,
      points: largestTransferPct >= 50 ? 15 : 8,
    })
  }

  if (recipients.size >= 4 && topRecipientSharePct !== null && topRecipientSharePct >= 50 && topRecipient) {
    signals.push({
      id: 'recipient-concentration', severity: topRecipientSharePct >= 75 ? 'medium' : 'info',
      title: 'Recent incoming transfers were concentrated',
      evidence: `One address (${topRecipient.slice(0, 8)}…${topRecipient.slice(-6)}) received ${topRecipientSharePct.toFixed(2)}% of non-burn transfer volume in this window. This is not a holder-balance or ownership calculation.`,
      points: topRecipientSharePct >= 75 ? 15 : 8,
    })
  }

  const score = Math.min(100, signals.reduce((sum, signal) => sum + signal.points, 0))
  const hasReviewSignal = signals.some((signal) => signal.severity === 'high' || signal.severity === 'medium')
  const level = events.length === 0 ? 'insufficient' : score >= 50 ? 'elevated' : score >= 20 || hasReviewSignal ? 'review' : 'low'
  const label = {
    insufficient: 'Insufficient transfer evidence',
    low: signals.length ? 'Informational transfer flags observed' : 'No configured transfer flags in this window',
    review: 'Review the observed transfer flags',
    elevated: 'Elevated transfer flags observed',
  }[level]
  const sortedEvents = [...events].sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex)

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
      note: 'This is a rule-based review of ERC-20 Transfer events in the most recent 500-block window. It does not establish current holder balances, liquidity, sellability, contract permissions, or safety. No configured flag is not proof that a token is safe.',
    },
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
