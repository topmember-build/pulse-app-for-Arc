import { z } from 'zod'

const envSchema = z.object({
  ARC_RPC_URL: z.string().url(), ARC_CHAIN_ID: z.string().min(1), PULSE_RECEIVING_ADDRESS: z.string().min(1), CIRCLE_API_KEY: z.string().min(1), SESSION_SECRET: z.string().min(1),
})

export function getEnv() {
  const result = envSchema.safeParse(process.env)
  if (!result.success) throw new Error(`Missing or invalid runtime environment variables: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`)
  return result.data
}
