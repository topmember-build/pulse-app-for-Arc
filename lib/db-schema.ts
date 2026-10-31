import { sql } from 'drizzle-orm'
import {
  integer,
  boolean,
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

export const pulsePayments = pgTable('pulse_payments', {
  txHash: text('tx_hash').primaryKey(),
  walletAddress: text('wallet_address').notNull(),
  privyUserId: text('privy_user_id').notNull(),
  scanType: text('scan_type').notNull(),
  targetAddress: text('target_address').notNull(),
  chainId: integer('chain_id').notNull(),
  amountUnits: text('amount_units').notNull(),
  // in_progress: a scan is running on this payment. verified: paid and not yet delivered. consumed: scan delivered.
  status: text('status').notNull().default('in_progress'),
  claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  result: jsonb('result').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Counters only: no address, wallet, user id or IP is stored here.
export const pulseScanEvents = pgTable('pulse_scan_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  scanType: text('scan_type').notNull(),
  deep: boolean('deep').notNull().default(false),
  outcome: text('outcome').notNull(),
  signedIn: boolean('signed_in').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
