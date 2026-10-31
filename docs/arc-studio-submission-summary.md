# Pulse for Arc: what was built where

Pulse is a plain-language safety checker for tokens and contracts on Arc. Anyone can run a free scan. A deep scan (wallets, linked-wallet clusters, admin controls) costs 0.001 USDC, paid through a contract on Arc Mainnet.

Live app: https://pulse-for-arc.vercel.app
Repository: https://github.com/topmember-build/pulse-app-for-Arc

## Built in Arc Studio

Everything below was built in Arc Studio on 2026-10-30 and 2026-10-31. The dates and authors are in the repository history (commits `2f4cd42` and `14166cf`, pull requests #2 and #3).

**Smart contract (written, reviewed and tested in Arc Studio)**
- `PulseScanPayments` (`contracts/PulseScanPayments.sol`): a user pays in native USDC in one transaction. The contract forwards the whole amount to the treasury in the same call and emits `ScanPaid(payer, target, scanType, amount)`, which ties each payment to one exact scan. It never holds funds. The owner can change the price (maximum 1 USDC) and the treasury; there is no pause, no upgrade and no withdraw, and ownership cannot be renounced.
- Two independent automated security reviews at the deepest level (one minor finding, fixed, then clean), static analysis (informational notes only), and 52 Foundry tests (unit, fuzz and invariant).
- Deployed to Arc Mainnet: `0xa0f08Fb8adb9cBb7C08f251B7141975F72fE60ed`
  https://explorer.arc.io/address/0xa0f08Fb8adb9cBb7C08f251B7141975F72fE60ed
- A test copy on Arc Testnet was used first: `0x8ee4d351307cbc5cf62345a613b54c2b146f1d31`.

**Payments and security**
- Server-side payment verification: the server reads the contract's `ScanPaid` event and accepts a payment only if the payer, exact target, scan type and amount match. Each payment works once, only for the wallet that paid (it signs a free message), and a result lost in transit can be re-fetched without paying again.
- A security review of the payment and scan routes (`docs/security-review.md`) with the fixes applied.

**Scanning and analysis**
- Free scans without an account or wallet.
- Deep scans: top wallets by live balance, linked-wallet clusters, bytecode review for mint, pause, blacklist and upgrade controls, and an animated holder map built on the existing heart graphic.
- Plain-language safety verdicts with a glossary, aimed at people who are not technical.
- Private per-user analytics and anonymous activity counts (no addresses or IPs stored).
- Rate-limit handling for Arc's public RPC and a dedicated RPC for everything except log reads.

**Deployment**
- Production deploy on Vercel, with a deployment checklist (`docs/deployment-checklist.md`).

## Existed before Arc Studio

The project was imported from a GitHub repository that already contained a working app. Per the repository history (commits from 2026-10-25 to 2026-10-28 by `v0` and a human author), that earlier work included:
- The app's interface and visual design, created outside Arc Studio (the heart graphic and theme).
- The original token and contract scanner, Privy wallet verification for API routes, and scan history.
- Shared-source cluster, bundle and circular-flow signals, and the contract control-surface checks (added in the owner's update on 2026-10-28).

Arc Studio gated the cluster and bundle findings to deep scans, built the payment contract and flow, and added the features listed above.

## Evidence to link

| What | Link |
| --- | --- |
| Mainnet contract | https://explorer.arc.io/address/0xa0f08Fb8adb9cBb7C08f251B7141975F72fE60ed |
| Live deep-scan payment through the contract | https://explorer.arc.io/tx/0x661d37d2c7535d993facf9f6d4ff235d7583c62d14f36a349437819ae020ef23 |
| Pull request: deep scans, verdicts, analytics | https://github.com/topmember-build/pulse-app-for-Arc/pull/2 |
| Pull request: payment contract and wiring | https://github.com/topmember-build/pulse-app-for-Arc/pull/3 |
| Security review | `docs/security-review.md` |

The payment above was made from the treasury wallet itself (the money went out through the contract and back to the same wallet), so only gas was spent. A payment from a different wallet would be stronger evidence of real USDC moving.

## Suggested wording for the submission

"Pulse for Arc is a safety checker for tokens and contracts on Arc, written in plain language for people who are not technical. Free scans need no account. A deep scan shows the biggest wallets, linked-wallet clusters and admin controls, and costs 0.001 USDC, paid through our PulseScanPayments contract on Arc Mainnet. The payment contract, its tests and reviews, the payment verification, the deep-scan analysis and the deployment were built in Arc Studio. The interface was designed outside Arc Studio on top of an earlier version of the scanner. We are happy to share the commit history."

## Confirm with the organisers before submitting

- Whether a project that began as an imported repository, with an interface made outside Arc Studio, is eligible for the "Built with Arc Studio" round.
- The exact closing time and timezone.
- Whether a payment made from the treasury wallet counts as "real USDC moving".

## Limits to be upfront about

- The security reviews were automated, not an independent professional audit.
- The mainnet contract was compiled without the optimizer. Its code is identical to the audited source compiled that way (verified byte for byte), and the unit tests ran on the optimized build.
- Deep-scan results show wallets active in a 10,000-block window, not a full holder list, and cluster findings are patterns, not proof of common ownership.
