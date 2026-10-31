# Deployment checklist

Host: any Node host for Next.js (Vercel, Netlify with its Next.js support, or a Docker host). The app has server API routes, so a static-only host will not work.

## Environment variables (set in the host, never in the repo)
Required
- NEXT_PUBLIC_PRIVY_APP_ID, PRIVY_APP_SECRET: Privy wallet connection.
- DATABASE_URL: pooled Postgres connection string (scan history, payments, analytics).
- PULSE_RECEIVING_ADDRESS: the wallet that receives deep-scan payments. You must control it.

Payments (Arc Mainnet, real USDC)
- PULSE_PAYMENT_CHAIN_ID=5042, PULSE_PAYMENT_CHAIN_NAME=Arc Mainnet
- PULSE_PAYMENT_RPC_URL=https://rpc.mainnet.arc.io (public, sent to browsers: no API key)
- PULSE_PAYMENT_EXPLORER_URL=https://explorer.arc.io
- PULSE_PAYMENT_USDC_ADDRESS=0x3600000000000000000000000000000000000000
- PULSE_PAYMENT_CONTRACT=0xa0f08Fb8adb9cBb7C08f251B7141975F72fE60ed (Arc Mainnet PulseScanPayments; leave unset to use a plain USDC transfer)
- PULSE_DEEP_SCAN_PRICE_USDC (optional, default 0.001)

RPC (recommended)
- ARC_RPC_URL: dedicated provider URL (server only, contains your key).
- ARC_RPC_MIN_GAP_MS=20 when using a dedicated provider.
- ARC_LOGS_RPC_URL: leave empty to read logs from the public Arc RPC.

## Before going live
1. Privy dashboard: add the deployed origin to allowed origins.
2. Run the SQL files in db/ once against the database (pulse_payments.sql, pulse_scan_events.sql). The scan history and rate limit tables must already exist.
3. Make one small live deep scan and confirm the payment arrives at the receiving address.
4. Set a usage limit and alerts on the RPC provider account.
5. Arrange an independent audit before meaningful volume. See docs/security-review.md.
