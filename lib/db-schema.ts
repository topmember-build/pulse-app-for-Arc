import { sql } from 'drizzle-orm'
import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const pulseRateLimits = pgTable('pulse_rate_limits', {
  identityHash: text('identity_hash').notNull(),
  bucket: text('bucket').notNull(),
  windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull().defaultNow(),
  requestCount: integer('request_count').notNull().default(1),
}, (table) => [
  primaryKey({ columns: [table.identityHash, table.bucket], name: 'pulse_rate_limits_pkey' }),
])

export const pulseScanHistory = pgTable('pulse_scan_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletAddress: text('wallet_address'),
  privyUserId: text('privy_user_id'),
  scanType: text('scan_type').notNull(),
  targetAddress: text('target_address').notNull(),
  network: text('network').notNull().default('arc-testnet'),
  status: text('status').notNull(),
  summary: jsonb('summary').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
