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
  N: z.number(), ids: z.array(z.string()), names: z.record(z.string(), z.string()), blocks: z.array(z.array(z.record(z.string(), z.unknown()))),
  states: z.array(z.record(z.string(), z.unknown())), appear: z.record(z.string(), z.number().nullable()), cnt: z.array(z.number()), tcCum: z.array(z.number()), pcCum: z.array(z.number()),
})

export type ContractScan = z.infer<typeof contractScanSchema>
export type TokenScan = z.infer<typeof tokenScanSchema>
