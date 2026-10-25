import { z } from 'zod'

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid EVM address')

export const contractScanRequestSchema = z.object({ address })
export const tokenScanRequestSchema = z.object({ address })

const findingSchema = z.object({
  sev: z.enum(['high', 'med', 'low', 'ok', 'info']),
  short: z.string(), plain: z.string(), title: z.string(), detail: z.string(), where: z.string(), power: z.string().optional(),
})

export const contractScanSchema = z.object({
  id: z.string(), name: z.string(), kind: z.string(), addr: z.string(), headline: z.string(),
  beat: z.object({ every: z.number(), jitter: z.number() }),
  flow: z.object({ dep: z.number(), wd: z.number(), fail: z.number() }),
  owner: z.object({ type: z.string(), label: z.string(), dots: z.number(), lit: z.number(), last: z.string() }),
  top: z.object({ label: z.string(), share: z.number(), dots: z.number() }).optional(),
  facts: z.array(z.tuple([z.string(), z.string()])),
  powers: z.array(z.object({ id: z.string(), label: z.string(), guard: z.string(), guardLabel: z.string(), sev: z.enum(['high', 'med', 'low', 'ok', 'info']), siphon: z.boolean() })),
  findings: z.array(findingSchema),
})

export const tokenScanSchema = z.object({
  token: z.object({
    address,
    name: z.string(),
    symbol: z.string(),
    decimals: z.number().int().min(0).max(36).nullable(),
    totalSupply: z.string().nullable(),
  }),
  network: z.object({ name: z.string(), chainId: z.number().int() }),
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
    transactionHash: z.string(),
    logIndex: z.number().int().nonnegative(),
    from: address,
    to: address,
    type: z.enum(['mint', 'burn', 'transfer']),
    amount: z.string().nullable(),
    amountRaw: z.string(),
  })),
  scannedAt: z.string().datetime(),
})

export type ContractScan = z.infer<typeof contractScanSchema>
export type TokenScan = z.infer<typeof tokenScanSchema>
