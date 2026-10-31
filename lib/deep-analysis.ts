// Bytecode-level inspection used by deep scans. It walks the runtime bytecode opcode by
// opcode (skipping PUSH data) and reports which well-known function selectors the
// dispatcher references and which sensitive opcodes appear.

export type Capability = {
  id: string
  label: string
  severity: 'info' | 'review'
  detail: string
}

export type BytecodeAnalysis = {
  capabilities: Capability[]
  opcodes: { delegatecall: boolean; selfdestruct: boolean; create: boolean }
}

const SELECTORS: Record<string, Omit<Capability, 'id'> & { id: string }> = {
  '0x40c10f19': { id: 'mint', label: 'Mint function', severity: 'review', detail: 'A mint(address,uint256) selector is referenced, so new supply may be creatable by some caller.' },
  '0xa0712d68': { id: 'mint-public', label: 'Mint function', severity: 'review', detail: 'A mint(uint256) selector is referenced, so new supply may be creatable by some caller.' },
  '0x42966c68': { id: 'burn', label: 'Burn function', severity: 'info', detail: 'A burn(uint256) selector is referenced.' },
  '0x79cc6790': { id: 'burn-from', label: 'Burn-from function', severity: 'info', detail: 'A burnFrom(address,uint256) selector is referenced.' },
  '0x8456cb59': { id: 'pause', label: 'Pause control', severity: 'review', detail: 'A pause() selector is referenced, so transfers or actions may be stoppable.' },
  '0x3f4ba83a': { id: 'unpause', label: 'Unpause control', severity: 'info', detail: 'An unpause() selector is referenced.' },
  '0xf9f92be4': { id: 'blacklist', label: 'Blacklist control', severity: 'review', detail: 'A blacklist(address) selector is referenced, so addresses may be blockable.' },
  '0x0ecb93c0': { id: 'blacklist-add', label: 'Blacklist control', severity: 'review', detail: 'An addBlackList(address) selector is referenced, so addresses may be blockable.' },
  '0xfe575a87': { id: 'blacklist-check', label: 'Blacklist check', severity: 'info', detail: 'An isBlacklisted(address) selector is referenced.' },
  '0xf2fde38b': { id: 'transfer-ownership', label: 'Ownership transfer', severity: 'info', detail: 'A transferOwnership(address) selector is referenced.' },
  '0x715018a6': { id: 'renounce-ownership', label: 'Ownership renounce', severity: 'info', detail: 'A renounceOwnership() selector is referenced.' },
  '0x3659cfe6': { id: 'upgrade-to', label: 'Upgrade function', severity: 'review', detail: 'An upgradeTo(address) selector is referenced, so the logic may be replaceable.' },
  '0x4f1ef286': { id: 'upgrade-to-and-call', label: 'Upgrade function', severity: 'review', detail: 'An upgradeToAndCall(address,bytes) selector is referenced, so the logic may be replaceable.' },
  '0x2f2ff15d': { id: 'grant-role', label: 'Role-based access', severity: 'info', detail: 'A grantRole(bytes32,address) selector is referenced; privileged roles may exist.' },
  '0x91d14854': { id: 'has-role', label: 'Role-based access', severity: 'info', detail: 'A hasRole(bytes32,address) selector is referenced; privileged roles may exist.' },
}

export function analyzeBytecode(code: string): BytecodeAnalysis {
  const hex = code.startsWith('0x') ? code.slice(2) : code
  const found = new Map<string, Capability>()
  const opcodes = { delegatecall: false, selfdestruct: false, create: false }

  for (let i = 0; i * 2 + 2 <= hex.length;) {
    const op = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    if (op >= 0x60 && op <= 0x7f) {
      const size = op - 0x5f
      if (op === 0x63) {
        const selector = `0x${hex.slice((i + 1) * 2, (i + 5) * 2).toLowerCase()}`
        const known = SELECTORS[selector]
        if (known && !found.has(known.label)) found.set(known.label, known)
        else if (known && known.severity === 'review' && found.get(known.label)?.severity !== 'review') found.set(known.label, known)
      }
      i += 1 + size
      continue
    }
    if (op === 0xf4) opcodes.delegatecall = true
    else if (op === 0xff) opcodes.selfdestruct = true
    else if (op === 0xf0 || op === 0xf5) opcodes.create = true
    i += 1
  }

  return { capabilities: [...found.values()], opcodes }
}

export function mergeAnalyses(primary: BytecodeAnalysis, secondary: BytecodeAnalysis | null): BytecodeAnalysis {
  if (!secondary) return primary
  const byLabel = new Map(primary.capabilities.map((item) => [item.label, item]))
  for (const item of secondary.capabilities) {
    const current = byLabel.get(item.label)
    if (!current || (current.severity !== 'review' && item.severity === 'review')) byLabel.set(item.label, { ...item, detail: `${item.detail} (found in the implementation contract)` })
  }
  return {
    capabilities: [...byLabel.values()],
    opcodes: {
      delegatecall: primary.opcodes.delegatecall || secondary.opcodes.delegatecall,
      selfdestruct: primary.opcodes.selfdestruct || secondary.opcodes.selfdestruct,
      create: primary.opcodes.create || secondary.opcodes.create,
    },
  }
}
