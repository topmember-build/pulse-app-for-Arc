# PulseScanPayments

A small payment contract for Pulse deep scans on Arc. A user pays in native USDC (one transaction, no approval step). The contract forwards the whole payment to the treasury in the same transaction and emits `ScanPaid(payer, target, scanType, amount)`, so the server can check the payment onchain and tie it to one exact scan. The contract never holds funds.

- Source: `PulseScanPayments.sol` (single-file copy without imports: `flattened/PulseScanPayments.flat.sol`)
- Tests: `test/` (unit, fuzz, invariant)
- Owner can change the price (up to 1 USDC) and the treasury. No pause, no upgrade, no withdraw, ownership cannot be renounced.

## Deployments

| Network | Address |
| --- | --- |
| Arc Mainnet (5042) | `0xa0f08Fb8adb9cBb7C08f251B7141975F72fE60ed` |
| Arc Testnet (5042002), test copy | `0x8ee4d351307cbc5cf62345a613b54c2b146f1d31` |

The mainnet copy was compiled with Solidity 0.8.28, cancun, optimizer off. Its code is identical to the flattened source compiled that way.

## Build and test

Requires [Foundry](https://getfoundry.sh/) (Arc's docs recommend Arc Foundry for deploying to Arc).

```
pnpm install
pnpm add -D @openzeppelin/contracts@5.6.1   # only needed to build/test the contract, not to run the app
forge install foundry-rs/forge-std --no-git
forge test
```

`foundry.toml` and `remappings.txt` are at the repo root.

## Independent review

An automated review and test suite were run during development. They are not a substitute for an independent professional audit.
