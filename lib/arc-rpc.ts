import { ARC_NETWORK } from './arc-network'

export const ARC_RPC_URL = process.env.ARC_RPC_URL?.trim() || ARC_NETWORK.rpcUrl
