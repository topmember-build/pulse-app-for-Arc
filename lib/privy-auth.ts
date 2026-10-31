import { NotFoundError, PrivyClient } from '@privy-io/node'

export class WalletAuthError extends Error {
  constructor(public readonly status: 401 | 403 | 503, public readonly code: string) {
    super(code)
  }
}

let privyClient: PrivyClient | undefined

function getPrivyClient() {
  if (privyClient) return privyClient

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID
  const appSecret = process.env.PRIVY_APP_SECRET
  if (!appId || !appSecret) throw new WalletAuthError(503, 'auth_unavailable')

  privyClient = new PrivyClient({ appId, appSecret })
  return privyClient
}

export async function getVerifiedPrivyWallet(request: Request, walletAddress: string) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) throw new WalletAuthError(403, 'wallet_not_linked')

  const accessToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!accessToken || accessToken.length > 8192) throw new WalletAuthError(401, 'authentication_required')

  const client = getPrivyClient()
  let userId: string
  try {
    const claims = await client.utils().auth().verifyAccessToken(accessToken)
    userId = claims.user_id
  } catch {
    throw new WalletAuthError(401, 'authentication_required')
  }

  try {
    const user = await client.users().getByWalletAddress({ address: walletAddress })
    if (user.id !== userId) throw new WalletAuthError(403, 'wallet_not_linked')
    return { walletAddress: walletAddress.toLowerCase(), userId }
  } catch (error) {
    if (error instanceof WalletAuthError) throw error
    if (error instanceof NotFoundError) throw new WalletAuthError(403, 'wallet_not_linked')
    throw new WalletAuthError(503, 'auth_unavailable')
  }
}

export type Caller = { userId: string; walletAddress: string | null }
export type VerifiedWallet = Caller

async function verifiedUserId(request: Request) {
  const accessToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!accessToken || accessToken.length > 8192) throw new WalletAuthError(401, 'authentication_required')
  const client = getPrivyClient()
  try {
    const claims = await client.utils().auth().verifyAccessToken(accessToken)
    return claims.user_id
  } catch {
    throw new WalletAuthError(401, 'authentication_required')
  }
}

// Identity is the signed-in Privy account. The connected wallet is only the payer for deep
// scans, so it does not have to be linked to the account; the header is kept as a label only.
export async function getPrivyCaller(request: Request): Promise<Caller> {
  const userId = await verifiedUserId(request)
  const wallet = request.headers.get('x-pulse-wallet') ?? ''
  return { userId, walletAddress: /^0x[0-9a-fA-F]{40}$/.test(wallet) ? wallet.toLowerCase() : null }
}

// Basic scans work without signing in. When credentials are sent they must be valid,
// so an expired session surfaces as an error instead of silently losing history.
export async function getOptionalPrivyWallet(request: Request): Promise<Caller | null> {
  if (!request.headers.get('authorization')) return null
  return getPrivyCaller(request)
}
