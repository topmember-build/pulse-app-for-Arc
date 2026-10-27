import { z } from 'zod'
import { ARC_NETWORK } from './arc-network'

const envSchema = z.object({
  ARC_RPC_URL: z.string().url().optional(),
  PULSE_RECEIVING_ADDRESS: z.string().min(1).optional(),
  CIRCLE_API_KEY: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(1).optional(),
})

export function getEnv() {
  const result = envSchema.safeParse(process.env)
  if (!result.success) throw new Error(`Missing or invalid runtime environment variables: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`)
  return {
    ...result.data,
    ARC_RPC_URL: result.data.ARC_RPC_URL ?? ARC_NETWORK.rpcUrl,
    ARC_CHAIN_ID: String(ARC_NETWORK.chainId),
  }
}
