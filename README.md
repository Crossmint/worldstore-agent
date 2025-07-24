# x402-worldstore Monorepo

A pnpm workspace monorepo containing x402 payment protocol integration with Crossmint Worldstore and XMTP agent.

## Architecture

```
x402-worldstore/
├── 402-server/          # Express API server with x402 payment protocol
├── xmtp-agent/          # XMTP integration with AI tools
├── pnpm-workspace.yaml  # Workspace configuration
└── package.json         # Root package with workspace scripts
```

## Packages

### 402-server
Express API that combines x402 payment protocol with Crossmint Worldstore for crypto-powered Amazon purchases.

### xmtp-agent
XMTP integration with AI/LangChain tools and Crossmint Wallets SDK for blockchain interactions.

## Getting Started

```bash
# Install all workspace dependencies
pnpm install

# Run both apps simultaneously in development mode
pnpm run dev:both

# Or run individual apps
pnpm run dev:server    # Run only 402-server
pnpm run dev:agent     # Run only xmtp-agent

# Production mode
pnpm run start:both    # Run both apps in production

# Build all packages
pnpm build

# Run linting across all packages
pnpm lint

# Run tests across all packages
pnpm test
```

## Workspace Commands

### Running Applications
- `pnpm run dev:both` - Run both apps simultaneously in development mode
- `pnpm run start:both` - Run both apps simultaneously in production mode
- `pnpm run dev:server` - Run only the 402-server in development
- `pnpm run dev:agent` - Run only the xmtp-agent in development
- `pnpm run start:server` - Run only the 402-server in production

### Development Commands
- `pnpm dev` - Start all development servers (runs each package's dev script)
- `pnpm build` - Build all packages
- `pnpm lint` - Run ESLint on all packages
- `pnpm test` - Run tests on all packages
- `pnpm clean` - Clean build artifacts and node_modules

## Package Management

This monorepo uses pnpm workspaces with:
- Shared dependencies at the root level
- Individual package.json files for package-specific dependencies
- Centralized dependency management and linking