# Pulse: instructions for AI coding agents

Pulse checks tokens and smart contracts on Arc and explains the result in plain words. The UI is an anatomical heart: the heart is a token's liquidity pool or the contract itself, blue veins are money in, red arteries are money out, amber is a warning.

## The design is the source of truth
- Do not restyle, rename, re-layout or "modernize" anything. Keep the colors, fonts, spacing, copy and the heart exactly as they are.
- Do not add emojis, stock icons, gradients or generic UI libraries.
- Plain-language rule: any new user-facing text must be understandable to someone new to crypto. Say what it means for their money. Technical detail goes in the "Technical detail" fold-outs.
- Never state that something is "safe". Verdict wording stays: "No major red flags found", "Use caution", "Unsafe signals found". Keep the line that no scan can prove safety.

## File map (plain HTML, CSS and JS, no build step yet)
- `index.html`, `style.css`: landing page, scanner, sign-in sheet, summary card, tour.
- `js/heart.js`: `drawHeart()` anatomical heart renderer. Do not change it.
- `js/sim.js`: simulated token launch. Exposes `SIM` (see "Seams").
- `js/contracts.js`: three simulated contract scans plus `scoreOf()` and `verdictOf()`.
- `js/app.js`: scanner, canvas drawing, panels, tour, glossary, and the mock account and payment module.
- `js/landing.js`: landing page animation and sample verdicts.

## Seams to replace with real things (keep everything else)
1. **Payment and sign-in.** In `js/app.js`, the block marked "account: sign in, balance and payment" (`acct`, `requirePay`, `openAuth`, `renderAuth`, `charge`). Replace the simulation with real wallet connect or Circle wallet sign-in and a real 0.001 USDC charge per scan. Keep `requirePay(run)` as the single entry point: it must call `run()` only after payment succeeds. Keep the same screens and copy.
2. **Contract scans.** `CONTRACTS` in `js/contracts.js` is the response shape for `POST /api/scan/contract`: `{id,name,kind,addr,beat,flow,owner,top?,facts,powers[],findings[]}` where each finding is `{sev,short,plain,title,detail,where,power?}`. Fetch this from the backend instead of the constant. `scoreOf()` and `verdictOf()` stay.
3. **Token scans.** `SIM` in `js/sim.js` (`blocks`, `states`, `appear`, `cnt`, `tcCum`, `pcCum`) is the shape for `POST /api/scan/token`. Replace the scripted scenario with data computed from real Arc transfers. The detectors there (fan-out, circular transfers, rapid accumulation) are the intended logic.
4. **Remove the test hook** `window.__arc` before any public deploy.

## Backend to add
- Arc RPC reads: `eth_getCode`, `eth_getStorageAt` (EIP-1967 slots), `eth_call` (owner, Safe threshold, timelock delay), `eth_getLogs` (ERC-20 Transfer).
- Paywall every scan route with x402 using Circle Gateway nanopayments. Verify the current package names and Arc mainnet availability in Circle's docs before coding.
- Wallets used for nanopayments must be ordinary EOA addresses, not smart-contract accounts.
- Cache scan results briefly, rate-limit by account, validate every address input.
