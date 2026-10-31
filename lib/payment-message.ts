// The text the paying wallet signs after sending the USDC. It ties one payment to one
// scan, so nobody else can claim a payment they did not make. No account is involved.
export function paymentMessage(input: { txHash: string; scanType: 'token' | 'contract'; target: string; chainId: number }) {
  return [
    'Pulse deep scan payment',
    `Payment: ${input.txHash.toLowerCase()}`,
    `Scan: ${input.scanType} ${input.target.toLowerCase()}`,
    `Chain: ${input.chainId}`,
  ].join('\n')
}
