# Using Pulse with Claude and Arc Studio

## What is true today
- Arc Studio is Circle's coding agent for Arc. In the browser it writes, previews and deploys full-stack apps to **Arc testnet**. You export the code and deploy to mainnet yourself with your own credentials.
- Arc Studio also has a **CLI** that you can run from a terminal or call from Claude Code, Codex or Cursor.
- Arc Studio is not documented as an MCP server. The MCP piece is the **Arc Docs MCP server**, which lets Claude read Arc documentation.
- I could not confirm that the browser version imports an existing project. The route below keeps your design files untouched either way.

## Route A (recommended): Claude Code in this folder, Arc Studio as the onchain helper
1. Put this folder in a git repo and open it in Claude Code. `CLAUDE.md` tells Claude to keep the design exactly as it is.
2. Give Claude the Arc docs:
   `claude mcp add --transport http arc-docs https://docs.arc.io/mcp`
   (No sign-in needed. Check it with `claude mcp list`.)
   In Claude Desktop instead: Settings, Connectors, Add custom connector, name `Arc Docs`, URL `https://docs.arc.io/mcp`.
3. Install the Arc Studio CLI from https://docs.arc.io/ai/arc-studio-cli and sign in. Third-party installers show `arc-studio login` and `arc-studio whoami`, and a Claude Code plugin. Follow that page for the exact commands, since I could not read it.
4. Ask Claude Code to do the work in the order below. It edits your files directly, so the design cannot drift, and delegates contract and deploy tasks to Arc Studio.

## Route B: Arc Studio in the browser
Open the Arc Studio workbench, add these files to a new project (the editable file workbench is built in), then paste the first prompt below. If it will not take your files, use Route A.

## Prompts, in order (paste one at a time)
1. **Payment proof first.** "Read AGENTS.md. Do not change any design file. Add a small backend with one route, POST /api/scan/contract, that returns CONTRACTS[0] from js/contracts.js but only after a 0.001 USDC x402 payment using Circle Gateway nanopayments on Arc. Check the current Circle and Arc docs through the Arc Docs MCP first. Show me a working payment on Arc testnet end to end before anything else."
2. **Sign-in.** "Replace the mock account module in js/app.js with real wallet connect plus email sign-in through Circle. Keep requirePay(run) as the only entry point and keep every screen and word of copy. Wallets used for payment must be EOA."
3. **Real contract scan.** "Implement the scan behind POST /api/scan/contract using Arc RPC reads: bytecode selectors, EIP-1967 proxy slots, owner and admin, Safe threshold, timelock delay. Return the exact CONTRACTS shape in AGENTS.md. Add tests with a mocked RPC."
4. **Real token scan.** "Build an indexer for Arc transfers into Postgres, then compute the SIM shape for POST /api/scan/token using the funder, matching-amount, timing, circular-flow and shared-exit signals. Keep the existing detectors' wording."
5. **Ship.** "Remove window.__arc, add rate limits and address validation, deploy to Arc testnet, then give me a checklist for moving to mainnet with my own credentials."

## Before mainnet
Circle warns that AI-generated code can contain errors and security weaknesses. Have the payment code and key handling reviewed by a person. Taking custody of user funds (for email wallets) may carry legal duties, so check with a lawyer first.
