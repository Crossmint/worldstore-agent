# Worldstore Agent

A pnpm workspace monorepo containing example agent implementations for Crossmint's worldstore APIs.

## Architecture

```
x402-worldstore/
├── xmtp-402-agent/      # x402 payment integration
│   ├── agent/           # XMTP agent that interacts with custom 402 server
│   └── server/          # Custom server serving 402 payment responses
├── xmtp-agent/          # Direct Crossmint Worldstore integration
├── pnpm-workspace.yaml  # Workspace configuration
└── package.json         # Root package with workspace scripts
```

## Packages

### xmtp-402-agent
Complete x402 payment solution consisting of:
- **Agent**: XMTP integration that communicates with the custom 402 server for payment processing
- **Server**: Express API that serves 402 payment protocol responses integrated with Crossmint

### xmtp-agent
XMTP integration with AI/LangChain tools that interacts directly with Crossmint Worldstore APIs for blockchain interactions.

## Getting Started

```bash
# Install all workspace dependencies
pnpm install

# Run all applications simultaneously in development mode
pnpm run dev

# Run individual applications
pnpm run dev:402-server    # Run only the 402 server
pnpm run dev:402-agent     # Run only the 402 agent
pnpm run dev:worldstore    # Run only the worldstore agent

# Production mode
pnpm run start:402-server  # Run 402 server in production
pnpm run start:402-agent   # Run 402 agent in production
pnpm run start:worldstore  # Run worldstore agent in production

# Build all packages
pnpm build

# Run linting across all packages
pnpm lint

# Run tests across all packages
pnpm test
```

## Workspace Commands

### Running Applications
- `pnpm dev` - Start all development servers (runs each package's dev script)
- `pnpm run dev:402-server` - Run only the x402 server in development
- `pnpm run dev:402-agent` - Run only the x402 agent in development
- `pnpm run dev:worldstore` - Run only the worldstore agent in development
- `pnpm run start:402-server` - Run only the x402 server in production
- `pnpm run start:402-agent` - Run only the x402 agent in production
- `pnpm run start:worldstore` - Run only the worldstore agent in production

### Development Commands
- `pnpm build` - Build all packages
- `pnpm lint` - Run ESLint on all packages
- `pnpm test` - Run tests on all packages
- `pnpm clean` - Clean build artifacts and node_modules

## Package Management

This monorepo uses pnpm workspaces with:
- Shared dependencies at the root level
- Individual package.json files for package-specific dependencies
- Centralized dependency management and linking