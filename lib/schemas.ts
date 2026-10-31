import { z } from 'zod'

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid EVM address')

const txHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/)
const scanRequest = z.object({ address, deep: z.boolean().optional(), paymentTxHash: txHash.optional(), paymentSignature: z.string().regex(/^0x[0-9a-fA-F]{130}$/).optional() })

export const contractScanRequestSchema = scanRequest
export const tokenScanRequestSchema = scanRequest

export const holderAnalysisSchema = z.object({
  basis: z.string(),
  addressesSeen: z.number().int().nonnegative(),
  walletsChecked: z.number().int().nonnegative(),
  top10Pct: z.number().nullable(),
  whales: z.array(z.object({
    address,
    balance: z.string(),
    pct: z.number().nullable(),
    isContract: z.boolean().nullable(),
    clusterId: z.number().int().nullable(),
  })),
  bubbles: z.array(z.object({
    address,
    balance: z.string(),
    pct: z.number().nullable(),
    share: z.number().min(0).max(1),
    isContract: z.boolean().nullable(),
    clusterId: z.number().int().nullable(),
  })).default([]),
  links: z.array(z.object({
    source: address,
    target: address,
    kind: z.enum(['transfer', 'funding']),
    transferCount: z.number().int().nonnegative(),
  })).default([]),
  clusters: z.array(z.object({
    id: z.number().int(),
    memberCount: z.number().int().nonnegative(),
    membersChecked: z.number().int().nonnegative(),
    funder: address.nullable(),
    combinedBalance: z.string(),
    combinedPct: z.number().nullable(),
    fromBlock: z.number().int().nonnegative(),
    toBlock: z.number().int().nonnegative(),
    evidence: z.string(),
    members: z.array(address),
  })),
})

export const deepScanSchema = z.object({
  holders: holderAnalysisSchema.optional(),
  scope: z.string(),
  windowBlocks: z.number().int().nonnegative().nullable(),
  implementationAnalyzed: z.boolean(),
  capabilities: z.array(z.object({
    id: z.string(),
    label: z.string(),
    severity: z.enum(['info', 'review']),
    detail: z.string(),
  })),
  opcodes: z.object({ delegatecall: z.boolean(), selfdestruct: z.boolean(), create: z.boolean() }),
})

const networkSchema = z.object({ name: z.string(), chainId: z.number().int() })

export const tokenScanSchema = z.object({
  token: z.object({
    address,
    name: z.string().nullable(),
    symbol: z.string().nullable(),
    decimals: z.number().int().min(0).max(36).nullable(),
    totalSupply: z.string().nullable(),
  }),
  network: networkSchema,
  coverage: z.object({
    fromBlock: z.number().int().nonnegative(),
    toBlock: z.number().int().nonnegative(),
    blockCount: z.number().int().nonnegative(),
    transferEventsObserved: z.number().int().nonnegative(),
    transferEventsAnalyzed: z.number().int().nonnegative(),
    invalidEvents: z.number().int().nonnegative(),
    truncated: z.boolean(),
  }),
  metrics: z.object({
    transferCount: z.number().int().nonnegative(),
    uniqueSenders: z.number().int().nonnegative(),
    uniqueRecipients: z.number().int().nonnegative(),
    activeAddresses: z.number().int().nonnegative(),
    totalTransferAmount: z.string().nullable(),
    mintedAmount: z.string().nullable(),
    burnedAmount: z.string().nullable(),
    mintedSupplyPct: z.number().nullable(),
    largestTransferPct: z.number().nullable(),
    topRecipientSharePct: z.number().nullable(),
  }),
  assessment: z.object({
    score: z.number().int().min(0).max(100),
    level: z.enum(['insufficient', 'low', 'review', 'elevated']),
    label: z.string(),
    signals: z.array(z.object({
      id: z.string(),
      severity: z.enum(['high', 'medium', 'info']),
      title: z.string(),
      evidence: z.string(),
    })),
    note: z.string(),
  }),
  clusters: z.array(z.object({
    id: z.string(),
    sourceAddress: address,
    sampleAddresses: z.array(address),
    recipientCount: z.number().int().nonnegative(),
    transferCount: z.number().int().nonnegative(),
    transactionCount: z.number().int().nonnegative(),
    firstBlock: z.number().int().nonnegative(),
    lastBlock: z.number().int().nonnegative(),
    matchingAmountPct: z.number().min(0).max(100),
    grossTransferAmount: z.string().nullable(),
    grossSupplySharePct: z.number().nullable(),
    commonExitAddress: address.nullable(),
    commonExitWalletCount: z.number().int().nonnegative(),
    evidence: z.array(z.string()),
    severity: z.enum(['medium', 'info']),
  })).default([]),
  bundleSignals: z.array(z.object({
    id: z.string(),
    kind: z.enum(['single_transaction_fanout', 'same_block_burst']),
    blockNumber: z.number().int().nonnegative(),
    sourceAddress: address,
    recipientCount: z.number().int().nonnegative(),
    transactionCount: z.number().int().positive(),
    transferCount: z.number().int().positive(),
    matchingAmountPct: z.number().min(0).max(100),
    evidence: z.string(),
  })).default([]),
  circularFlows: z.array(z.object({
    id: z.string(),
    addresses: z.array(address).length(3),
    firstBlock: z.number().int().nonnegative(),
    lastBlock: z.number().int().nonnegative(),
    evidence: z.string(),
  })).default([]),
  transfers: z.array(z.object({
    blockNumber: z.number().int().nonnegative(),
    transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    logIndex: z.number().int().nonnegative(),
    from: address,
    to: address,
    type: z.enum(['mint', 'burn', 'transfer']),
    amount: z.string().nullable(),
    amountRaw: z.string(),
  })),
  scannedAt: z.string().datetime(),
  historySaved: z.boolean(),
  anonymous: z.boolean().optional(),
  deep: deepScanSchema.optional(),
})

export const contractScanSchema = z.object({
  contract: z.object({
    address,
    bytecodeBytes: z.number().int().positive(),
    nativeBalance: z.string(),
    token: z.object({
      isTokenLike: z.boolean(),
      name: z.string().nullable(),
      symbol: z.string().nullable(),
      decimals: z.number().int().min(0).max(36).nullable(),
      totalSupply: z.string().nullable(),
    }),
    ownerStatus: z.enum(['active', 'renounced', 'not_exposed']),
    ownerAddress: address.nullable(),
    pauseStatus: z.enum(['paused', 'not_paused', 'not_exposed']),
    proxy: z.object({
      kind: z.enum(['eip1967', 'eip1167', 'none_detected', 'unknown']),
      implementation: address.nullable(),
      implementationBytecodeBytes: z.number().int().nonnegative().nullable(),
      admin: address.nullable(),
      beacon: address.nullable(),
    }),
    controlSurface: z.object({
      safeThreshold: z.number().int().positive().nullable(),
      safeOwners: z.array(address),
      timelockMinDelaySeconds: z.number().int().nonnegative().nullable(),
      selectorCandidates: z.array(z.object({
        selector: z.string().regex(/^0x[0-9a-fA-F]{8}$/),
        signature: z.string(),
        title: z.string(),
        category: z.string(),
        severity: z.enum(['info', 'review']),
      })),
    }),
  }),
  network: networkSchema,
  coverage: z.object({
    blockNumber: z.number().int().nonnegative(),
    scannedAt: z.string().datetime(),
  }),
  observations: z.array(z.object({
    id: z.string(),
    severity: z.enum(['info', 'review']),
    title: z.string(),
    detail: z.string(),
  })),
  limitations: z.array(z.string()),
  historySaved: z.boolean(),
  anonymous: z.boolean().optional(),
  deep: deepScanSchema.optional(),
})

export const scanHistoryEntrySchema = z.object({
  id: z.string().uuid(),
  scanType: z.enum(['token', 'contract']),
  targetAddress: address,
  network: z.string(),
  status: z.enum(['complete', 'failed', 'pending']),
  summary: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
})

export const scanHistoryResponseSchema = z.object({ scans: z.array(scanHistoryEntrySchema) })

export type ContractScan = z.infer<typeof contractScanSchema>
export type TokenScan = z.infer<typeof tokenScanSchema>
export type ScanHistoryEntry = z.infer<typeof scanHistoryEntrySchema>
