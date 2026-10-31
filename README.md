# Pulse for Arc

Pulse is a plain-language safety checker for tokens and smart contracts on Arc. Paste an address and get a clear verdict, the reasons behind it, and what to do next, written for people who are not blockchain experts.

- **Free scans** need no wallet and no account.
- **Deep scans** cost a small USDC payment (0.001 USDC by default). They add whale wallets, linked-wallet clusters, bundle patterns, an animated heart map of who holds the token, and a review of admin controls such as mint, pause, blacklist and upgrade functions.

Pulse reads public Arc data. It cannot prove anything is safe and it does not look at the people behind a project. Nothing here is financial advice.

## How it works for users

1. Open the app and paste a token or contract address.
2. Press **Run live scan**. No sign-in is needed.
3. Read the summary: **No major red flags found**, **Be careful**, **High risk** or **Not enough information**, with short reasons and a "What do these words mean?" glossary.
4. For a closer look, press **Deep scan**. Connect a wallet, approve one small USDC transfer, and sign a free message. The server checks the payment onchain, then runs the scan.

Signed-in users also get saved scan history and personal analytics. Anonymous scans are only counted (type, outcome and date), never stored with an address or IP.

## What is checked

Free scans:
- Recent ERC-20 transfer activity (2,500 blocks): large moves, recent minting, concentrated recipients.
- Contract profile: runtime bytecode, owner and pause getters, proxy patterns, Safe multi-signature and timelock hints, and common admin-function selectors.

Deep scans add:
- A 10,000-block transfer window.
- The largest wallets by live balance, with contracts told apart from wallets.
- Linked-wallet clusters, same-block bundles, and circular transfers.
- A bytecode review for mint, burn, pause, blacklist, upgrade and role controls.
- An animated heart map: the heart is the token, each wallet is a blood cell, and amber rings mark linked clusters.

Limits to keep in mind:
- Only wallets active inside the scan window are examined. This is not a full holder list.
- Clusters and bundles are patterns, not proof that one person controls the wallets.
- Liquidity, honeypot and sellability checks, and source-code verification, are not included.

## Tech stack

- Next.js (App Router) and React, TypeScript, Tailwind CSS
- Privy, used only as a wallet connection (no email login, no created wallets)
- Arc JSON-RPC over HTTP, with optional dedicated provider
- Postgres through Drizzle ORM and `pg` (scan history, payments, rate limits, counters)
- `viem` for signature verification

## Repository layout

```text
app/
  api/scan/token/        Token scan endpoint (free and deep)
  api/scan/contract/     Contract scan endpoint (free and deep)
  api/payment/config/    Public payment settings for the browser
  api/history/           Signed-in scan history
  api/stats/             Personal analytics and public activity counts
  api/health/            Database and RPC health check
  pulse/                 Main page
components/              Dashboard, results, safety summary, heart map, analytics
lib/                     Scan analysis, payment verification, verdicts, RPC client
db/                      SQL for tables Pulse adds
docs/                    Security review and deployment checklist
```

## Requirements

- Node.js 20 or newer
- pnpm (version pinned by `packageManager`)
- A Privy app (wallet connection)
- A Postgres database (Neon works well)
- An Arc RPC (the public endpoint works; a dedicated provider is recommended for traffic)

## Local development

```bash
pnpm install
cp .env.example .env.local   # then fill in the values
pnpm dev
```

Open http://localhost:3000. Build and run production locally:

```bash
pnpm build
pnpm start
```

## Environment variables

Never commit real values. Everything below is read on the server unless noted.

Required:
- `NEXT_PUBLIC_PRIVY_APP_ID`: Privy app ID (safe for the browser).
- `PRIVY_APP_SECRET`: Privy secret (server only).
- `DATABASE_URL`: pooled Postgres connection string.
- `PULSE_RECEIVING_ADDRESS`: wallet that receives deep-scan payments. You must control it.

Deep-scan payments (Arc Mainnet moves real USDC; the code defaults to Arc Testnet if these are unset):
- `PULSE_PAYMENT_CHAIN_ID`, `PULSE_PAYMENT_CHAIN_NAME`
- `PULSE_PAYMENT_RPC_URL`: **sent to every visitor's browser**, so use a public URL with no API key.
- `PULSE_PAYMENT_EXPLORER_URL`, `PULSE_PAYMENT_USDC_ADDRESS`
- `PULSE_PAYMENT_CONTRACT` (optional): address of the deployed `PulseScanPayments` contract. When set, a deep scan is paid in one transaction through the contract, which forwards the payment to the receiving wallet and records which scan it was for. Leave empty to use a plain USDC transfer.
- `PULSE_DEEP_SCAN_PRICE_USDC`: optional, defaults to `0.001`.

RPC (optional):
- `ARC_RPC_URL`: dedicated provider for general reads. Contains a key, so it stays server-side.
- `ARC_RPC_MIN_GAP_MS`: spacing between RPC requests. Defaults to 230 for the public RPC; use about 20 with a dedicated provider.
- `ARC_LOGS_RPC_URL`: RPC used only for `eth_getLogs`. Defaults to the public Arc RPC, because some free plans limit log reads to a few blocks.

## Database setup

The scan history and rate-limit tables must exist. Run the SQL files in `db/` once against your database:

```bash
psql "$DATABASE_URL" -f db/pulse_payments.sql
psql "$DATABASE_URL" -f db/pulse_scan_events.sql
```

## Payments and security

- A payment unlocks exactly one scan, and only for the wallet that paid. The paying wallet signs a message naming the payment, the scan type, the target address and the network.
- The server never trusts the browser for price, recipient, network or sender. It reads the onchain receipt and checks the USDC transfer itself.
- If a scan fails after payment, the payment is released for a retry. Delivered results are stored so the payer can fetch them again.
- Routes are rate limited per client IP. Run behind a trusted proxy such as Vercel.

See `docs/security-review.md` for the review notes and open items, and `docs/deployment-checklist.md` before going live. An independent professional audit is recommended before handling meaningful volume. Mainnet transactions are irreversible: test on testnet first.

## Deployment

Any Node host for Next.js works (Vercel is the simplest). The app has server API routes, so a static-only host will not work.

1. Set the environment variables in the host.
2. Add the deployed origin to your Privy app's allowed origins.
3. Run the SQL in `db/` once.
4. Deploy, then check `GET /api/health`.
5. Make one small live deep scan and confirm the payment arrives at your receiving address.

## Contributing

Keep changes focused and document behavior that affects wallet, RPC, payment, or security boundaries. For user-visible behavior, verify both desktop and narrow mobile layouts.

Use clear commit messages and avoid committing local environment files, build output, wallet credentials, RPC keys, or user data.

## License

No open-source license has been selected yet. Treat this repository as proprietary until a license is added by the project owner.
