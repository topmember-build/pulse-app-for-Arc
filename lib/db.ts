import { attachDatabasePool } from '@vercel/functions'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '@/lib/db-schema'

const globalForPulse = globalThis as unknown as { pulsePool?: Pool }
const hasExistingPool = Boolean(globalForPulse.pulsePool)
const pool = globalForPulse.pulsePool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

globalForPulse.pulsePool = pool
if (!hasExistingPool) attachDatabasePool(pool)

export const db = drizzle(pool, { schema })
