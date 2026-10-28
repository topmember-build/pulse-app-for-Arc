import { randomUUID } from 'node:crypto'
import { checkRateLimit } from '@/lib/rate-limit'
import { getVerifiedPrivyWallet, WalletAuthError } from '@/lib/privy-auth'
import { saveScanHistory } from '@/lib/scan-history'
import { contractScanRequestSchema, contractScanSchema } from '@/lib/schemas'
import { formatTokenAmount } from '@/lib/token-analysis'
import { ARC_CHAIN_ID, ARC_NETWORK_NAME, ARC_NATIVE_CURRENCY } from '@/lib/arc-network'
import {
  callArcRpc,
  decodeAbiAddress,
  decodeAbiBoolean,
  decodeAbiString,
  decodeStorageAddress,
  optionalEthCall,
  parseRpcBigInt,
  parseRpcQuantity,
} from '@/lib/arc-rpc'

export const runtime = 'nodejs'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'
const ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103'
const BEACON_SLOT = '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50'

function response(requestId: string, body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-request-id': requestId, ...headers } })
}

function findMinimalProxyImplementation(bytecode: string) {
  const match = bytecode.toLowerCase().match(/363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3/)
  return match ? `0x${match[1]}` : null
}

async function readStorage(address: string, slot: string, blockTag: string) {
  try {
    return await callArcRpc<unknown>('eth_getStorageAt', [address, slot, blockTag])
  } catch {
    return null
  }
}

async function saveHistory(
  userId: string,
  walletAddress: string,
  address: string,
  status: 'complete' | 'failed',
  summary: Record<string, unknown>,
) {
  await saveScanHistory({
    walletAddress,
    privyUserId: userId,
    scanType: 'contract',
    targetAddress: address,
    status,
    summary,
  })
}

export async function POST(request: Request) {
  const requestId = randomUUID()
  const startedAt = Date.now()

  try {
    const rateLimit = await checkRateLimit(request, 'contract-scan', 20, 60)
    if (!rateLimit.allowed) {
      console.info(JSON.stringify({ event: 'pulse.api.rate_limited', route: 'contract-scan', requestId }))
      return response(requestId, { error: 'rate_limited', retryAfter: rateLimit.retryAfter }, 429, { 'retry-after': String(rateLimit.retryAfter) })
    }
  } catch {
    console.error(JSON.stringify({ event: 'pulse.api.rate_limit_unavailable', route: 'contract-scan', requestId }))
    return response(requestId, { error: 'service_unavailable' }, 503)
  }

  let verifiedWallet: Awaited<ReturnType<typeof getVerifiedPrivyWallet>>
  try {
    verifiedWallet = await getVerifiedPrivyWallet(request, request.headers.get('x-pulse-wallet') ?? '')
  } catch (error) {
    const status = error instanceof WalletAuthError ? error.status : 503
    const code = error instanceof WalletAuthError ? error.code : 'auth_unavailable'
    return response(requestId, { error: code }, status)
  }

  const parsed = contractScanRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return response(requestId, { error: 'invalid_input' }, 400)

  const address = parsed.data.address.toLowerCase()
  try {
    const [chainIdValue, blockValue] = await Promise.all([
      callArcRpc<unknown>('eth_chainId', []),
      callArcRpc<unknown>('eth_blockNumber', []),
    ])

    if (parseRpcQuantity(chainIdValue) !== ARC_CHAIN_ID) {
      await saveHistory(verifiedWallet.userId, verifiedWallet.walletAddress, address, 'failed', { error: 'wrong_network' }).catch(() => undefined)
      console.info(JSON.stringify({ event: 'pulse.contract_scan.completed', requestId, outcome: 'wrong_network', durationMs: Date.now() - startedAt }))
      return response(requestId, { error: 'wrong_network' }, 502)
    }

    const blockNumber = parseRpcQuantity(blockValue)
    if (blockNumber === null) throw new Error('arc_rpc_invalid_block')
    const blockTag = `0x${blockNumber.toString(16)}`
    const [codeValue, balanceValue] = await Promise.all([
      callArcRpc<unknown>('eth_getCode', [address, blockTag]),
      callArcRpc<unknown>('eth_getBalance', [address, blockTag]),
    ])

    if (typeof codeValue !== 'string' || !/^0x(?:[0-9a-f]{2})*$/i.test(codeValue)) throw new Error('arc_rpc_invalid_code')
    if (codeValue === '0x') {
      await saveHistory(verifiedWallet.userId, verifiedWallet.walletAddress, address, 'failed', { error: 'not_a_contract' }).catch(() => undefined)
      console.info(JSON.stringify({ event: 'pulse.contract_scan.completed', requestId, outcome: 'not_a_contract', durationMs: Date.now() - startedAt }))
      return response(requestId, { error: 'not_a_contract' }, 422)
    }

    const balanceRaw = parseRpcBigInt(balanceValue)
    if (balanceRaw === null) throw new Error('arc_rpc_invalid_response')

    const [nameResult, symbolResult, decimalsResult, supplyResult, ownerResult, pausedResult, implementationSlotValue, adminSlotValue, beaconSlotValue] = await Promise.all([
      optionalEthCall(address, '0x06fdde03', blockTag),
      optionalEthCall(address, '0x95d89b41', blockTag),
      optionalEthCall(address, '0x313ce567', blockTag),
      optionalEthCall(address, '0x18160ddd', blockTag),
      optionalEthCall(address, '0x8da5cb5b', blockTag),
      optionalEthCall(address, '0x5c975abb', blockTag),
      readStorage(address, IMPLEMENTATION_SLOT, blockTag),
      readStorage(address, ADMIN_SLOT, blockTag),
      readStorage(address, BEACON_SLOT, blockTag),
    ])

    const decimalsValue = parseRpcQuantity(decimalsResult)
    const decimals = decimalsValue !== null && decimalsValue <= 36 ? decimalsValue : null
    const totalSupplyRaw = parseRpcBigInt(supplyResult)
    const minimalProxyImplementation = findMinimalProxyImplementation(codeValue)
    const implementationSlotReadable = typeof implementationSlotValue === 'string' && /^0x[0-9a-f]{64}$/i.test(implementationSlotValue)
    const adminSlotReadable = typeof adminSlotValue === 'string' && /^0x[0-9a-f]{64}$/i.test(adminSlotValue)
    const beaconSlotReadable = typeof beaconSlotValue === 'string' && /^0x[0-9a-f]{64}$/i.test(beaconSlotValue)
    const eip1967Implementation = decodeStorageAddress(implementationSlotValue)
    const admin = decodeStorageAddress(adminSlotValue)
    const beacon = decodeStorageAddress(beaconSlotValue)
    const implementation = eip1967Implementation ?? minimalProxyImplementation
    const proxyKind = eip1967Implementation || admin || beacon
      ? 'eip1967' as const
      : minimalProxyImplementation
        ? 'eip1167' as const
        : implementationSlotReadable && adminSlotReadable && beaconSlotReadable
          ? 'none_detected' as const
          : 'unknown' as const

    const implementationCode = implementation
      ? await callArcRpc<unknown>('eth_getCode', [implementation, blockTag]).catch(() => null)
      : null
    const implementationBytecodeBytes = typeof implementationCode === 'string' && /^0x[0-9a-f]*$/i.test(implementationCode)
      ? Math.max(0, (implementationCode.length - 2) / 2)
      : null
    const ownerAddress = decodeAbiAddress(typeof ownerResult === 'string' ? ownerResult : null)
    const ownerStatus = !ownerAddress ? 'not_exposed' as const : ownerAddress === ZERO_ADDRESS ? 'renounced' as const : 'active' as const
    const pausedValue = decodeAbiBoolean(typeof pausedResult === 'string' ? pausedResult : null)
    const pauseStatus = pausedValue === null ? 'not_exposed' as const : pausedValue ? 'paused' as const : 'not_paused' as const
    const token = {
      isTokenLike: totalSupplyRaw !== null && decimals !== null,
      name: decodeAbiString(typeof nameResult === 'string' ? nameResult : null),
      symbol: decodeAbiString(typeof symbolResult === 'string' ? symbolResult : null),
      decimals,
      totalSupply: totalSupplyRaw !== null && decimals !== null ? formatTokenAmount(totalSupplyRaw, decimals) : null,
    }

    const observations: Array<{ id: string; severity: 'info' | 'review'; title: string; detail: string }> = [
      { id: 'runtime-bytecode', severity: 'info', title: 'Runtime bytecode found', detail: `The Arc Mainnet RPC returned ${((codeValue.length - 2) / 2).toLocaleString()} bytes at the scanned address.` },
    ]
    if (token.isTokenLike) {
      observations.push({ id: 'token-surface', severity: 'info' as const, title: 'Token-like read methods responded', detail: `totalSupply() and decimals() returned values${token.symbol ? ` for ${token.symbol}` : ''}. This does not prove full ERC-20 compliance.` })
    }
    if (ownerStatus === 'active' && ownerAddress) {
      observations.push({ id: 'owner-getter', severity: 'review' as const, title: 'owner() returned an address', detail: `The getter returned ${ownerAddress}. This is one ownership interface, not a complete role or permissions inventory.` })
    } else if (ownerStatus === 'renounced') {
      observations.push({ id: 'owner-getter', severity: 'info' as const, title: 'owner() returned the zero address', detail: 'This may indicate renounced ownership for this interface, but does not rule out other roles or a proxy administrator.' })
    }
    if (pauseStatus === 'paused') {
      observations.push({ id: 'pause-getter', severity: 'review' as const, title: 'paused() returned true', detail: `The common paused() getter reported a paused state at block ${blockNumber.toLocaleString()}.` })
    } else if (pauseStatus === 'not_paused') {
      observations.push({ id: 'pause-getter', severity: 'info' as const, title: 'paused() returned false', detail: 'This getter does not cover custom restrictions or other pause mechanisms.' })
    }
    if (proxyKind === 'eip1967') {
      observations.push({ id: 'proxy-pattern', severity: 'info' as const, title: 'EIP-1967 proxy storage detected', detail: `Proxy-related storage contains ${[eip1967Implementation && `implementation ${eip1967Implementation}`, admin && `admin ${admin}`, beacon && `beacon ${beacon}`].filter(Boolean).join(', ')}. Review the target and upgrade controls directly.` })
    } else if (proxyKind === 'eip1167' && implementation) {
      observations.push({ id: 'proxy-pattern', severity: 'info' as const, title: 'EIP-1167 clone pattern detected', detail: `The runtime bytecode references implementation ${implementation}. The scan does not inspect the implementation's full behavior.` })
    } else if (proxyKind === 'none_detected') {
      observations.push({ id: 'proxy-pattern', severity: 'info' as const, title: 'Supported proxy patterns not detected', detail: 'No nonzero EIP-1967 slot or exact EIP-1167 runtime pattern was found. Other proxy designs may not be detected.' })
    } else {
      observations.push({ id: 'proxy-pattern', severity: 'info' as const, title: 'Proxy status is unknown', detail: 'The current RPC did not return all EIP-1967 storage slots, so absence of a supported proxy pattern could not be confirmed.' })
    }
    if (!token.isTokenLike) {
      observations.push({ id: 'token-surface', severity: 'info' as const, title: 'Token interface not confirmed', detail: 'The contract did not return both a valid totalSupply() and decimals() value in this scan.' })
    }

    const resultCore = contractScanSchema.omit({ historySaved: true }).parse({
      contract: {
        address,
        bytecodeBytes: (codeValue.length - 2) / 2,
        nativeBalance: formatTokenAmount(balanceRaw, ARC_NATIVE_CURRENCY.decimals),
        token,
        ownerStatus,
        ownerAddress,
        pauseStatus,
        proxy: {
          kind: proxyKind,
          implementation,
          implementationBytecodeBytes,
          admin,
          beacon,
        },
      },
      network: { name: ARC_NETWORK_NAME, chainId: ARC_CHAIN_ID },
      coverage: { blockNumber, scannedAt: new Date().toISOString() },
      observations,
      limitations: [
        'No verified source code, compiler metadata, audit, or complete bytecode analysis is checked.',
        'Only common owner() and paused() getters are sampled; role-based access controls and custom admin paths may be different.',
        'Proxy inspection covers EIP-1967 slots and an exact EIP-1167 runtime pattern only; other proxy designs may be missed.',
        'No liquidity, holder balances, transaction history, transfer taxes, sellability, or market data is checked.',
      ],
    })

    let historySaved = false
    try {
      await saveHistory(verifiedWallet.userId, verifiedWallet.walletAddress, address, 'complete', {
        title: token.name ?? token.symbol ?? 'Contract profile scan',
        subtitle: `${resultCore.contract.bytecodeBytes.toLocaleString()} runtime bytes · ${proxyKind.replaceAll('_', ' ')}`,
        snapshot: { ...resultCore, historySaved: true },
      })
      historySaved = true
    } catch (error) {
      console.warn(JSON.stringify({ event: 'pulse.scan_history.write_failed', route: 'contract-scan', requestId, errorName: error instanceof Error ? error.name : 'unknown' }))
    }

    const result = contractScanSchema.parse({ ...resultCore, historySaved })
    console.info(JSON.stringify({ event: 'pulse.contract_scan.completed', requestId, durationMs: Date.now() - startedAt, isContract: true, bytecodeBytes: result.contract.bytecodeBytes, historySaved }))
    return response(requestId, result)
  } catch (error) {
    await saveHistory(verifiedWallet.userId, verifiedWallet.walletAddress, address, 'failed', { error: 'arc_rpc_unavailable' }).catch(() => undefined)
    console.error(JSON.stringify({ event: 'pulse.contract_scan.failed', requestId, durationMs: Date.now() - startedAt, errorName: error instanceof Error ? error.name : 'unknown' }))
    return response(requestId, { error: 'arc_rpc_unavailable' }, 502)
  }
}
