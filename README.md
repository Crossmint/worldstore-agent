# Worldstore Agent

> **Buy Amazon products with crypto through AI-powered conversations.** Zero gas fees, natural language interface, real shipping.

Welcome to the future of crypto-commerce, where "Hey, order me that new MacBook" actually works. This isn't another DeFi experiment that only works on weekends - it's a production-ready system that turns XMTP messages into real Amazon deliveries.

## What This Actually Does

Your users chat with an AI agent like they're texting a friend. The agent searches Amazon, handles payments in USDC (gasless, because nobody has time for gas fees), and ships real products to real addresses. It's the "shut up and take my crypto" experience developers have been trying to build for years.

```
User: "I need wireless headphones under $100"
Agent: "Found Sony WH-CH720N for $89.99. Want to order them?"
User: "Yes, ship to my usual address"
Agent: *generates USDC payment signature, processes order*
User: *receives Amazon package in 2 days*
```

**The twist?** No MetaMask popups. No gas fees. No blockchain complexity. Just conversations that end with stuff showing up at your door.

## Architecture: The Good Parts

This is a monorepo that doesn't make you want to cry:

```
worldstore-agent/
├── agent/          # XMTP AI agent - the conversational magic
├── server/         # x402 payment server - the crypto plumbing  
├── pnpm-workspace.yaml
└── package.json    # One script to rule them all
```

### The XMTP Agent (`/agent`)
The smooth-talking AI that handles everything users see:
- **Claude Sonnet 4** for conversations that don't suck
- **Redis** for speed (falls back to filesystem when Redis has a bad day)
- **Deterministic wallets** so each user gets their own payment identity
- **Profile management** because nobody wants to type their address 500 times
- **Interactive buttons** for when tapping is easier than typing

### The x402 Server (`/server`) 
The payment processor that makes crypto-to-Amazon actually work:
- **EIP-3009 signatures** for gasless USDC payments
- **Multi-network support** (Ethereum, Base, Polygon, Arbitrum)
- **Crossmint integration** for the actual Amazon fulfillment
- **Custom x402 implementation** because the official one has... limitations

## 15-Minute Setup (Honest Timing)

Stop reading setup guides that lie about timing. Here's what actually works:

### Prerequisites (5 minutes)
- **Node.js 20+** (`node --version`)
- **PNPM** (`npm install -g pnpm`)
- **Anthropic API key** (get from console.anthropic.com)
- **Crossmint account** (sign up at crossmint.com)
- **SerpAPI key** (optional, for enhanced product search)

### Installation (5 minutes)
```bash
git clone <your-repo-url>
cd worldstore-agent
pnpm install

# Start Redis (highly recommended for production performance)
docker run -d --name redis-stack -p 6379:6379 redis/redis-stack:latest
```

### Configuration (5 minutes)
```bash
# Copy environment templates
cp agent/.env.template agent/.env
cp server/.env.template server/.env

# Generate XMTP keys for the agent
cd agent && pnpm gen:keys

# Edit .env files with your API keys (see templates for details)
```

### Start Services
```bash
# Start both services with hot reload
pnpm dev

# Or start individually:
pnpm dev:agent    # XMTP agent only
pnpm dev:server   # Payment server only
```

### Verify Setup
```bash
# Check server health
curl http://localhost:3000/api/orders/facilitator/health

# Check Redis connection
redis-cli ping  # Should return PONG

# Agent will log XMTP connection details on startup
```

### Troubleshooting First Setup
**Agent not connecting to XMTP:**
- Check that `WALLET_KEY` and `ENCRYPTION_KEY` are set (run `pnpm gen:keys` if missing)
- Verify XMTP environment setting (`dev` vs `production`)

**Server health check fails:**
- Ensure all Crossmint env vars are set correctly
- Check that your Crossmint treasury wallet is funded
- Verify network configurations match your target chains

**Redis connection issues:**
- Agent falls back to filesystem storage automatically
- For production performance, ensure Redis Stack is running (not basic Redis)

**What you don't need:**
- A PhD in blockchain
- 17 different RPC endpoints  
- A Medium article to understand the architecture

## How Users Experience This

1. **First Contact**: User messages the agent, gets asked for basic profile info (name, email, address)
2. **Shopping**: Natural language product search - "wireless mouse under $50" or specific ASINs work equally well
3. **Payment**: Agent checks USDC balance, requests funding if needed (with helpful action buttons)
4. **Authorization**: User signs a payment authorization (gasless, just a signature)
5. **Fulfillment**: Order goes to Amazon via Crossmint, tracking info gets shared
6. **Delivery**: Real package arrives at real address

The entire flow feels like messaging a really competent personal shopper who happens to accept crypto.

## The Technical Reality

### Payments That Actually Work
- **Gasless USDC payments** via EIP-3009 `transferWithAuthorization`
- **Multi-network** so users aren't stuck on expensive chains
- **Deterministic wallets** generated per user for seamless UX
- **Balance checking** with funding requests when needed

### AI That Doesn't Hallucinate Orders
- **Claude Sonnet 4** with function calling for structured operations
- **Context management** so conversations feel natural
- **Slash commands** (`/clear`, `/help`, `/menu`) for power users
- **Interactive actions** for mobile-friendly experiences

### Storage That Scales
- **Redis** for production performance with JSON search
- **Filesystem fallback** when Redis is having an off day
- **Automatic migration** from filesystem to Redis
- **User profiles, order history, conversation state** all handled seamlessly

### Production Considerations We Actually Thought About
- **Error handling** that doesn't just crash and burn
- **Logging** that helps you debug at 2 AM
- **Environment configs** that make sense
- **Graceful degradation** when external services misbehave

## Workspace Commands That Work

```bash
# Development (both services with hot reload)
pnpm dev

# Individual services  
pnpm dev:agent      # Just the XMTP agent
pnpm dev:server     # Just the x402 server

# Production
pnpm start:agent    # Agent in production mode
pnpm start:server   # Server in production mode

# The usual dev tools
pnpm build         # Build everything
pnpm lint          # Fix your code style
pnpm type:check    # TypeScript won't save you from everything
pnpm clean         # Start fresh
```

## Technology Choices That Make Sense

- **XMTP Protocol**: Decentralized messaging that actually works
- **LangGraph + Claude**: AI framework that doesn't fight you  
- **Express.js**: Because sometimes boring is good
- **Redis**: For when filesystem storage isn't fast enough
- **GOAT SDK**: Blockchain operations that don't make you want to quit
- **Crossmint**: Amazon fulfillment without the complexity
- **TypeScript/JavaScript**: The languages you already know

## What's Next?

Each service has its own detailed README with the nitty-gritty details:
- **[`/agent/README.md`](/agent/README.md)** - XMTP agent setup, Redis configuration, and workflow details
- **[`/server/README.md`](/server/README.md)** - x402 protocol implementation and payment processing

This is crypto-commerce that actually ships products. Your users will thank you, and your support tickets will be about delivery addresses, not transaction failures.

Now go build something that matters.