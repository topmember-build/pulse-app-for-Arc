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
