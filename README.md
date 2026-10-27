# Pulse for Arc

Pulse is an Arc Mainnet beta scanner that turns token and contract addresses into evidence-focused reports, with scan coverage and limitations made explicit.

The Next.js App Router backend uses Privy for wallet authentication and Arc Mainnet JSON-RPC for read-only scans. It defaults to the official public endpoint, verifies chain ID 5042, and accepts an optional server-side `ARC_RPC_URL` override. Payment settlement is not enabled.

## Product status

**Current milestone: Arc Mainnet read-only scanning beta.**

Implemented:

- Privy wallet/email login with server-side wallet verification.
- Arc Mainnet token scans for metadata and ERC-20 Transfer events in the latest 500-block window, with rule-based transfer flags.
- Arc Mainnet contract checks for runtime bytecode and native USDC balance.
- Authenticated scan history, route-level rate limits, and a database/RPC health check.
- Mainnet chain-ID verification and structured request logging.
- The live scanner is separate from the synthetic token replay and illustrative landing-page scenarios.

Not yet included:

- Full historical indexing, current token-holder balances, liquidity, honeypot, and sellability analysis.
- Contract source verification, ownership/role/proxy analysis, and transaction or failed-call history.
- USDC payment creation, settlement, and payment verification.
- A dedicated RPC service with production quotas/SLAs, external error monitoring, and broad automated integration/security tests.

The animated token replay and landing-page risk scenarios are synthetic examples, not Mainnet evidence. Do not describe the application as fully production-ready until the remaining analysis, operational, and security work has been implemented and tested.

## Repository layout

```text
app/
  api/health/route.ts          Database and Arc Mainnet RPC health check
  api/scan/contract/route.ts   Live contract RPC scan endpoint
  api/scan/token/route.ts      Live ERC-20 transfer scan endpoint
  layout.tsx                   Root metadata and Privy provider shell
  page.tsx                     Next.js entry page
  privy-provider.tsx           Privy client integration and wallet bridge

public/pulse/
  index.html                   Pulse scanner markup
  style.css                    Visual system and responsive styles
  js/app.js                    Scanner state, controls, and account bridge
  js/config.js                 Client-side scanner configuration
  js/contracts.js              Contract finding weights and verdict labels
  js/heart.js                  Visualization renderer
  js/landing.js                Landing-page behavior and illustrative examples
  js/sim.js                    Synthetic token demo playback data

lib/
  arc-network.ts               Shared Arc Mainnet constants
  arc-rpc.ts                   Server-side RPC endpoint override
  env.ts                       Server environment validation
  schemas.ts                   API request and response schemas
```

## Requirements

- Node.js 20 or newer.
- pnpm 12.3.4, as declared by `packageManager`.
- A Privy application for wallet login.
- Arc Mainnet JSON-RPC; the official public endpoint is the default, with an optional `ARC_RPC_URL` override.

## Local development

Install dependencies:

```bash
pnpm install
```

Create a local environment file from the template:

```bash
cp .env.example .env.local
```

Start the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The scanner is available at `/pulse/index.html`.

Build and run the production bundle locally:

```bash
pnpm build
pnpm start
```

## Environment variables

The project reads environment variables through Next.js and server-side validation. Never commit real secrets.

### Required for Privy

```env
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_server_only_privy_secret
```

`NEXT_PUBLIC_PRIVY_APP_ID` is safe to expose to the browser. `PRIVY_APP_SECRET` must remain server-only and should never be placed in client code, logs, or the repository.

### Optional Arc Mainnet RPC override

```env
ARC_RPC_URL=https://rpc.mainnet.arc.io
```

If omitted, server routes use the official Arc Mainnet public RPC. The shared network configuration verifies chain ID `5042`; an override must point to Arc Mainnet. RPC access stays server-side so validation, timeouts, logging, and rate limits remain centralized.

### Optional application configuration

```env
PULSE_RECEIVING_ADDRESS=0x...
```

The receiving address is reserved for the payment phase. Payment creation and verification are not implemented in the current scanner milestone.

## Wallet connection

Privy is mounted at the root of the Next.js application through `app/privy-provider.tsx`.

The provider exposes a deliberately small browser bridge to the legacy static Pulse interface:

- `window.__pulsePrivyLogin()` opens the Privy login flow.
- `window.__pulsePrivyLogout()` signs the user out through Privy.
- `window.__pulsePrivyAccount` contains the current authenticated state and wallet address.
- `pulse:privy-authenticated` synchronizes a successful login into the scanner.
- `pulse:privy-signed-out` clears the scanner account state.

The bridge exists because the main scanner is served as a static experience under `public/pulse`. Keep the bridge narrow; do not expose Privy secrets, server tokens, or unrestricted provider methods to the browser.

Before release, configure the Privy dashboard with the deployed origins and enable only the login methods and chains the application actually supports.

## Live contract scan API

### `POST /api/scan/contract`

Request:

```json
{
  "address": "0x0000000000000000000000000000000000000000"
}
```

The route verifies the Privy wallet and applies rate limits, then checks the configured RPC chain ID and queries `eth_getCode` and `eth_getBalance` at the latest state. Responses include the address, Arc Mainnet label, runtime bytecode size, native USDC balance, and a limited finding. The contract endpoint does not fetch a block number or transaction history.

A successful RPC read is not a complete security audit. It does not prove source correctness, ownership safety, upgradeability safety, liquidity, sellability, or economic safety. Those checks should be added as separate, explicitly labeled analysis stages.

## Payment boundary

The scanner currently does not charge users. The payment UI and wallet connection are separate from payment settlement by design.

The planned Arc Studio integration should:

1. Ask the connected Privy wallet to approve the exact USDC amount and recipient.
2. Submit the transaction on the configured Arc chain.
3. Track the transaction until it reaches the required confirmation state.
4. Verify the transaction server-side using the configured RPC and expected recipient, token contract, amount, sender, chain, and recipient scan request.
5. Issue a short-lived scan authorization rather than trusting a client-provided transaction hash.
6. Unlock the scan only after verification succeeds.

Never unlock a paid scan from a browser-only success callback. Never trust an amount, recipient, chain ID, or sender supplied only by the client.

## Security and production checklist

Before public production launch:

- Set exact Privy allowed origins for local, preview, and production environments.
- Verify the configured endpoint reports Arc Mainnet chain ID `5042` in every deployment environment; choose a dedicated RPC provider and quotas for sustained traffic.
- Exercise timeout, retry, wrong-chain, and unavailable-provider behavior.
- Implement server-side payment verification before enabling scan charges.
- Validate the current route limits against per-user and per-IP abuse scenarios.
- Connect request-ID logs to external error monitoring without logging secrets or wallet credentials.
- Validate and normalize every contract address server-side.
- Keep all provider secrets in deployment environment variables.
- Add automated tests for invalid addresses, RPC failures, unavailable contracts, and payment replay.
- Keep Arc Mainnet and synthetic-demo labels explicit so sample visuals are never mistaken for live evidence.
- Review Privy and Arc terms, quotas, and operational limits before launch.

## Deployment

This is a Next.js application and can be deployed to Vercel or another Node-compatible host.

Set the environment variables in the deployment project, deploy, then verify:

```text
GET  /api/health
POST /api/scan/contract
GET  /pulse/index.html
```

Run the production build before deployment:

```bash
pnpm build
```

After deployment, test wallet login from the actual production origin. Embedded-wallet behavior inside an iframe or preview can differ from a top-level production page because browser cookie and popup policies vary by environment.

## Contributing

Keep changes focused and document behavior that affects wallet, RPC, payment, or security boundaries. For user-visible behavior, verify both desktop and narrow mobile layouts. For API changes, include validation and failure cases in the same change.

Use clear commit messages and avoid committing local environment files, build output, wallet credentials, RPC keys, or user data.

## License

No open-source license has been selected yet. Treat this repository as proprietary until a license is added by the project owner.
