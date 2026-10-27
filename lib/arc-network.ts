export const ARC_NETWORK = {
  name: 'Arc Mainnet',
  chainId: 5042,
  rpcUrl: 'https://rpc.mainnet.arc.io',
  nativeCurrency: {
    symbol: 'USDC',
    decimals: 18,
  },
} as const

export const ARC_CHAIN_ID = ARC_NETWORK.chainId
export const ARC_NETWORK_NAME = ARC_NETWORK.name
export const ARC_NATIVE_CURRENCY = ARC_NETWORK.nativeCurrency
