import { z } from 'zod'

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid EVM address')

export const contractScanRequestSchema = z.object({ address })
export const tokenScanRequestSchema = z.object({ address })

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
