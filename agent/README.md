# XMTP Worldstore Agent

> **The AI shopping assistant that speaks crypto.** Natural language Amazon orders, USDC payments, zero blockchain headaches.

This is the conversational brain of the Worldstore system - an XMTP agent that transforms "I need headphones" into Amazon packages at your door. It's Claude Sonnet 4 with a shopping addiction and a deterministic wallet.

## What Makes This Different

Most crypto shopping bots are essentially command-line interfaces with extra steps. This one actually converses like a human who happens to be really good at finding products and processing payments.

**Before (typical crypto commerce):**
```
> /search headphones
> /select item_id_7284729 
> /checkout
> *15 MetaMask popups later*
```

**After (this agent):**
```
User: "Need good wireless headphones under $150"
Agent: "Found Sony WH-1000XM4 for $129.99. Great noise cancellation, 
       30-hour battery. Want to order them?"
User: "Perfect, send to my usual address"
Agent: *quietly handles everything*
```

The difference? This agent remembers you're a human, not a API endpoint.

## Core Capabilities

### Conversations That Don't Suck
- **Natural language processing** powered by Claude Sonnet 4
- **Context awareness** across message threads
- **Profile memory** so you don't repeat your address 47 times
- **Interactive action buttons** for mobile-friendly experiences
- **Slash commands** for power users who want shortcuts

### Payments That Actually Work
- **Deterministic wallets** generated per user (no seed phrase management)
- **Gasless USDC payments** via EIP-3009 signatures
- **Multi-network support** (Base, Ethereum, Polygon, Arbitrum)
- **Balance checking** with helpful funding prompts
- **Smart funding requests** with action buttons instead of immediate wallet popups

### Storage That Scales
- **Redis integration** for production performance
- **Automatic migration** from filesystem to Redis
- **Graceful fallback** when Redis is unavailable
- **JSON search capabilities** for complex user queries
- **TTL management** for conversation caching

## 3-Minute Setup

### What You Need
- **Node.js 20+** (life's too short for old Node)
- **PNPM** (`npm install -g pnpm`)
- **Anthropic API key** (for the Claude magic)
- **XMTP wallet private key** (for messaging protocol access)
- **Running x402 server** (see `/server` directory)

### Environment Configuration

```bash
# Copy the template
cp .env.template .env
```

Your `.env` should include:

```bash
# AI Configuration
ANTHROPIC_API_KEY=sk-ant-your-key-here

# XMTP Protocol  
XMTP_KEY=0x1234abcd...  # Private key for XMTP client

# Backend Integration
WORLDSTORE_API_URL=http://localhost:3000  # Your x402 server

# Redis (highly recommended for production)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=          # Optional
REDIS_DB=0              # Default database

# Optional: Debugging
DEBUG_AGENT=false       # Enable detailed logging
```

### Installation & Startup

```bash
# Install dependencies
pnpm install

# Start Redis (recommended)
docker run -d --name redis-stack -p 6379:6379 redis/redis-stack:latest

# Run the agent
pnpm dev
```

**That's it.** The agent will automatically:
- Connect to XMTP network
- Initialize storage (Redis or filesystem fallback)  
- Migrate existing data if needed
- Start listening for messages

## Redis: The Performance Upgrade

Redis isn't required, but it transforms this from "pretty good" to "production ready." Here's why you want it:

### Performance Benefits
- **Sub-millisecond user profile lookups** instead of filesystem reads
- **Atomic operations** preventing race conditions during orders
- **JSON search capabilities** for complex user data queries
- **Conversation caching** with automatic TTL expiration
- **Horizontal scaling** when you need to handle more users

### Storage Architecture

```
Redis Key Structure:
├── user:{inboxId}                    # User profiles (JSON docs)
├── xmtp:{clientKey}:{data}          # XMTP protocol data
├── conversation:{inboxId}           # Cached state (1h TTL)
└── activity:{inboxId}:{date}        # Analytics data (7d TTL)
```

### Redis Setup Options

**Option 1: Docker (Recommended)**
```bash
# Full Redis Stack with JSON and search modules
docker run -d --name redis-stack -p 6379:6379 redis/redis-stack:latest

# Verify it's working
redis-cli ping  # Should return PONG
```

**Option 2: Local Installation**
```bash
# macOS
brew install redis
brew services start redis

# Ubuntu/Debian  
sudo apt update && sudo apt install redis-server
sudo systemctl start redis-server
```

**Important:** For full functionality (JSON documents, search indexes), you need Redis Stack. Basic Redis will work but with limited features.

### Migration & Fallback

The agent handles data migration automatically:

```bash
# Manual migration (if needed)
pnpm run migrate

# Rollback to filesystem
pnpm run migrate:rollback
```

If Redis goes down, the agent gracefully falls back to filesystem storage. Your users won't notice, but you'll want to fix Redis for performance reasons.

## User Interaction Patterns

### Profile Setup (First Time Users)
```
Agent: "Hi! I'm your crypto shopping assistant. To get started, 
       I'll need your name, email, and shipping address."
       
User: "John Doe, john@example.com, 123 Main St, NYC"

Agent: "Perfect! Profile saved. Now you can shop with just 
       'order headphones' or 'find a laptop under $1000'"
```

### Natural Language Shopping  
```
User: "I need a wireless mouse for gaming"

Agent: "Found Logitech G Pro X Superlight for $149.99. 
       25,600 DPI, 63g weight, great for competitive gaming. 
       Order it?"

User: "Yes"

Agent: *checks USDC balance, processes payment*
```

### Funding Flow (When Balance is Low)
```
Agent: "You need $89.99 USDC but only have $23.45. 
       What would you like to do?"
       
[💸 Add Funds Now] [❌ Cancel Order] [💰 Check Balance]

User: *taps "Add Funds Now"*

Agent: *sends wallet request for $66.54 USDC*
```

### Slash Commands for Power Users
- `/clear` - Reset conversation context (fresh start)
- `/menu` - Show main action menu with buttons  
- `/help` - Display help and available commands
- `/profile` - View/edit your profile information
- `/orders` - View order history and tracking

## Technical Architecture

### AI Agent Framework
```
LangGraph Agent
├── Profile Management Tools
│   ├── edit_profile()
│   └── read_profile()
├── Shopping Tools  
│   ├── search_product()
│   └── order_product()
├── Order Management Tools
│   ├── get_user_order_history()
│   └── get_order_status()
└── GOAT SDK Tools
    ├── Wallet operations
    └── USDC balance checking
```

### Payment Flow Deep Dive

1. **User Intent**: "Order this product"
2. **Product Lookup**: Agent queries x402 server for pricing
3. **Balance Check**: GOAT SDK checks user's USDC balance
4. **Payment Generation**: If sufficient funds, generates EIP-3009 signature
5. **Order Submission**: Sends signed payment to x402 server
6. **Fulfillment**: Server processes payment and places Amazon order
7. **Confirmation**: User gets order ID and tracking info

### Deterministic Wallets

Each user gets a deterministic wallet derived from their XMTP identity:
- **No seed phrase management** required
- **Consistent addresses** across sessions
- **Automatic wallet creation** on first interaction
- **Secure key derivation** using XMTP client keys

## Production Considerations

### Error Handling That Doesn't Suck
- **Graceful degradation** when external services fail
- **Informative error messages** users can actually understand
- **Automatic retries** for transient failures
- **Fallback behaviors** when primary systems are down

### Logging for Humans
```bash
# Enable detailed logging
DEBUG_AGENT=true pnpm dev
```

Logs include:
- User interaction patterns
- Payment flow debugging
- Redis/filesystem operations
- XMTP protocol events
- Error traces with context

### Security Boundaries
- **API key management** with environment isolation
- **Wallet isolation** per user with deterministic generation  
- **Payment authorization** through cryptographic signatures
- **Input validation** on all user-provided data

## Advanced Features

### Interactive Action Buttons

Instead of immediately sending wallet requests when funds are insufficient, the agent provides user-controlled options:

```typescript
// Enhanced UX with action buttons
const insufficientFundsResponse = {
  content: "You need $89.99 USDC but only have $23.45",
  actions: [
    { label: "💸 Add Funds Now", intent: "fund_wallet" },
    { label: "❌ Cancel Order", intent: "cancel_order" },
    { label: "💰 Check Balance", intent: "check_balance" }
  ]
}
```

### Conversation Context Management

The `/clear` command provides users control over conversation history:
- **Resets agent context** while preserving XMTP message history
- **Clears funding requirements** and profile menu states
- **Enables fresh starts** without losing user data
- **Maintains user profiles** and order history

### Multi-Network Payment Support

Automatically selects optimal payment network based on:
- **User preference** (if specified)
- **Current gas fees** across networks
- **USDC availability** in user wallet
- **Network reliability** and confirmation times

## Troubleshooting

### Common Issues

**Agent not responding to messages:**
```bash
# Check XMTP connection
pnpm dev --verbose

# Verify environment variables
echo $XMTP_KEY $ANTHROPIC_API_KEY
```

**Redis connection failures:**
```bash
# Test Redis connectivity
redis-cli ping

# Check Redis logs
docker logs redis-stack
```

**Payment authorization failures:**
```bash
# Verify x402 server is running
curl http://localhost:3000/api/orders/facilitator/health

# Check network configurations
# Ensure USDC contracts match your target networks
```

### Debug Mode

Enable comprehensive logging:
```bash
DEBUG_AGENT=true pnpm dev
```

This provides detailed insights into:
- Message processing flow
- AI agent decision making
- Payment signature generation
- Redis operations and fallbacks

## Development Workflow

```bash
# Development with hot reload
pnpm dev

# Production mode
pnpm start

# Run tests (if available)
pnpm test

# Check TypeScript
pnpm type:check

# Lint and format
pnpm lint
```

## Network Support

The agent works across multiple networks for maximum user flexibility:

| Network | USDC Contract | Status |
|---------|---------------|---------|
| **Base Mainnet** | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | ✅ Production |
| **Base Sepolia** | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | ✅ Testnet |
| **Ethereum** | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | ✅ Production |
| **Polygon** | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` | ✅ Production |
| **Arbitrum** | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | ✅ Production |

Users can specify network preference or let the agent choose the optimal one based on fees and availability.

This agent transforms crypto shopping from a technical exercise into a natural conversation. Your users will forget they're using blockchain technology, which is exactly the point.