# Pulse for Arc

Pulse is a production-oriented smart-contract intelligence interface for Arc. It turns a contract address into an explainable visual report: deployment status, runtime bytecode, balance, risk signals, and the limits of what the scan can prove.

The project combines a polished static scanner experience with a Next.js App Router backend. Privy handles wallet connection and embedded-wallet onboarding. Arc testnet RPC powers live contract inspection. Payment settlement is intentionally kept separate so it can be completed and audited in Arc Studio without coupling the scanner to unfinished payment logic.

## Product status

**Current milestone: wallet and live RPC foundation.**

Implemented:

- Privy wallet and email login entry points.
- Privy embedded-wallet configuration for Ethereum-compatible networks.
- Account synchronization between the Privy provider and the Pulse scanner UI.
- Sign-out propagation from Privy back into the scanner.
- Live contract scan endpoint backed by JSON-RPC calls.
- Contract-address input for live scans.
- Arc testnet-oriented configuration seam.
- Responsive dark interface with animated visualization and accessible controls.

Not yet included in this repository:

- USDC payment construction, settlement, or payment verification.
- A production token-analysis engine beyond the current visual/sample token experience.
- Persistent user accounts, scan history, or analytics storage.
- Rate limiting, abuse prevention, and production observability.

Do not describe the application as fully production-ready until those remaining systems have been implemented and tested on the target Arc environment.

## Repository layout

```text
app/
  api/health/route.ts          Health check endpoint
  api/scan/contract/route.ts   Live contract RPC scan endpoint
  api/scan/token/route.ts      Token scan API seam
  layout.tsx                   Root metadata and Privy provider shell
  page.tsx                     Next.js entry page
  privy-provider.tsx           Privy client integration and wallet bridge

public/pulse/
  index.html                   Pulse scanner markup
  style.css                    Visual system and responsive styles
  js/app.js                    Scanner state, controls, and account bridge
  js/config.js                 Client-side scanner configuration
  js/contracts.js              Contract visualization helpers
  js/heart.js                  Visualization renderer
  js/landing.js                Landing-page behavior
  js/sim.js                    Token visualization data and playback

lib/
  env.ts                       Server environment validation
  schemas.ts                   API request and response schemas
```

## Requirements

- Node.js 20 or newer.
- pnpm 12.3.4, as declared by `packageManager`.
- A Privy application for wallet login.
- An Arc-compatible JSON-RPC endpoint for live contract scans.

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

### Required for live Arc scans

```env
ARC_RPC_URL=https://your-arc-testnet-rpc.example
ARC_CHAIN_ID=your_arc_testnet_chain_id
```

`ARC_RPC_URL` is used by the server route, not directly by the browser. Keep RPC access behind the route so validation, timeouts, logging, and rate limits can be added in one place.

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

The route validates the address, then queries the configured RPC for:

- `eth_chainId`
- `eth_getCode`
- `eth_getBalance`

Successful responses include the normalized address, chain ID, deployment status, runtime bytecode size, native balance, block number, and a small set of explainable findings.

Example response shape:

```json
{
  "address": "0x...",
  "chainId": "0x...",
  "chain": "arc-testnet",
  "deployed": true,
  "runtimeBytecodeBytes": 1234,
  "nativeBalanceWei": "0",
  "blockNumber": "0x...",
  "findings": []
}
```

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
- Configure and verify the Arc testnet chain ID and RPC endpoint.
- Add RPC timeouts, bounded retries, and structured error responses.
- Add server-side payment verification before scan execution.
- Add per-user and per-IP rate limiting.
- Add request IDs and error monitoring without logging secrets or wallet credentials.
- Validate and normalize every contract address server-side.
- Keep all provider secrets in deployment environment variables.
- Add automated tests for invalid addresses, RPC failures, unavailable contracts, and payment replay.
- Add a clear network indicator so users cannot confuse testnet with mainnet.
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
