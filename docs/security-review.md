# Security review: payments and scan routes

Scope: deep-scan payment flow, scan routes, history and analytics routes, health and config routes, rate limiting.
Method: manual code review plus tests against the live database and the Arc RPC. This is not an independent audit.

## Checked and working
- A payment unlocks exactly one scan. Concurrent attempts on the same payment: one succeeds, one is refused.
- Only the wallet that paid can use a payment. A signature from any other wallet is refused. Tested.
- A payment is tied to one scan (type and address) and one network. A signature for a different address or type is refused. Tested.
- The server never trusts the browser for price, receiver, network or sender. All come from the server and the onchain receipt.
- A scan that fails after payment releases the payment so it can be retried. A delivered scan is stored so the payer can re-download it if the response was lost.
- SQL uses parameters throughout. Scan history and analytics are tied to the signed-in account, not to a header the client can set.
- The Alchemy key stays on the server. Only the payment network URL is public.

## Fixed during this review
- The health endpoint was public and unthrottled, and called the database and RPC on every hit. It now has a rate limit and a 10 second cache.
- A paid result could be lost if the response never reached the browser. Results are now stored with the payment and can be re-fetched by the paying wallet.
- The deep scan box now shows which address receives the payment.
- Documented that PULSE_PAYMENT_RPC_URL is sent to browsers and must not contain an API key.

## Open items and recommendations
- Independent professional audit before handling meaningful volume. This review is not a substitute.
- Rate limits key on the client IP header. This is reliable behind Vercel's proxy, but can be spoofed on a host that does not set it. Deploy behind a trusted proxy.
- Payments from smart-contract wallets are not supported, because verification uses a standard wallet signature.
- Wallet-to-payer matching relies on the USDC Transfer log. If Arc changes how USDC emits transfers, payment checks must be revisited.
- The paid scan's value is a one-time snapshot. Anyone who pays can read the result, which may be shared freely.
- Consider a dedicated RPC for log reads before heavy traffic (Alchemy free tier limits eth_getLogs to 10 blocks).
- Keep the receiving address in a wallet whose key you control and back up. Funds sent there are not recoverable by anyone else.
