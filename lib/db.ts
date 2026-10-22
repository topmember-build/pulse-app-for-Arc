import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

const globalForPulse = globalThis as unknown as { pulsePool?: Pool }
const pool = globalForPulse.pulsePool ?? new Pool({ connectionString: process.env.DATABASE_URL })
if (process.env.NODE_ENV !== 'production') globalForPulse.pulsePool = pool

export const db = drizzle(pool)
