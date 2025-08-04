# Worldstore Agent: Complete Systems Tutorial

**Build a production-ready crypto-commerce platform that enables Amazon purchases through AI-powered conversations using USDC payments.**

Having followed this tutorial, you'll have a working system where users can chat with an AI agent to buy Amazon products using cryptocurrency.

## Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Prerequisites & Environment Setup](#prerequisites--environment-setup)
3. [Component Deep Dive](#component-deep-dive)
4. [Step-by-Step Deployment](#step-by-step-deployment)
5. [Payment Flow End-to-End](#payment-flow-end-to-end)
6. [User Experience Walkthrough](#user-experience-walkthrough)
7. [Production Considerations](#production-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Extension Opportunities](#-extension-opportunities) *(toggle)*

---

## System Architecture Overview

The Worldstore Agent is a monorepo containing two symbiotic services that create a seamless crypto-to-commerce experience:

### The Big Picture

```
User Message -> XMTP Agent -> AI Processing -> Product Search -> Order Creation -> x402 Payment -> Amazon Fulfillment
```

But here's what actually happens under the hood:

**XMTP Agent** (`/agent/`) - The conversational brain
- **Core**: Claude Sonnet 4 powered shopping assistant
- **Protocol**: XMTP for decentralized messaging
- **Storage**: Redis for user profiles (or any persisting storage)
- **AI Framework**: LangGraph for complex conversation flows
- **Wallet Generation**: Deterministic wallets for gasless payments

**x402 Payment Server** (`/server/`) - The payment facilitator
- **Protocol**: Custom x402 implementation for gasless transactions
- **Integration**: Crossmint API for Amazon order placement

### What Makes This Special

This isn't just another crypto payment processor. Three architectural decisions make it production-ready:

1. **Gasless UX**: Users sign EIP-3009 permits instead of paying gas fees
2. **Deterministic Wallets**: No wallet setup
3. **Natural Language**: Complex e-commerce through simple conversation

---

## Prerequisites & Environment Setup

### System Requirements

- **Node.js 20+** - The foundation everything runs on
- **pnpm 8+** - Workspace management (faster than npm/yarn)
- **Redis Stack** - User state and conversation memory
- **Git** - For deployment and version control

### Required Accounts & API Keys

You need five essential accounts before starting:

1. **Anthropic API** - For Claude Sonnet 4 AI model
2. **Crossmint Account** - For Amazon order fulfillment
3. **SerpAPI** - For Amazon product search
4. **Redis Cloud** - Or local Redis instance. You need a redis direct connection url either from local instance or cloud
5. **Blockchain RPC Provider** - For wallet operations

### Quick Environment Check

```bash
# Verify your system is ready
node --version    # Should be 20+
pnpm --version   # Should be 8+
redis-cli ping   # Should return PONG; only required if running redis-cli locally
```

If any of these fail, fix them before continuing. The system won't work with missing dependencies.

---

## Component Deep Dive

### XMTP Agent Architecture

The agent is built around a central orchestration class with specialized helpers:

**XMTPShoppingBot** ([`index.ts`](./agent/index.ts)) - Main orchestrator
- Initializes all helper classes
- Manages XMTP client lifecycle
- Routes messages to appropriate handlers
- Coordinates agent responses

**Key Helper Classes:**

```typescript
// Core conversation processing
ConversationProcessor  // Routes messages to correct AI agent
                      // -> agent/helpers/conversationProcessor.ts

UserStateManager      // Tracks user context and funding requirements
                     // -> agent/helpers/userStateManager.ts

ActionMenuFactory     // Creates interactive UI elements
                     // -> agent/helpers/actionMenuFactory.ts

// Wallet & Payment Operations
WalletOperationsHandler // Manages balance checks and funding requests
                       // -> agent/helpers/walletOperationsHandler.ts

OrderToolWrapper       // Wraps order placement with payment logic
                      // -> agent/helpers/orderToolWrapper.ts

// XMTP Protocol Management
XMTPClientFactory      // Handles client creation and message streaming
                      // -> agent/helpers/xmtpClientFactory.ts
```

**Direct File Links:**
- [`ConversationProcessor`](./agent/helpers/conversationProcessor.ts)
- [`UserStateManager`](./agent/helpers/userStateManager.ts)
- [`ActionMenuFactory`](./agent/helpers/actionMenuFactory.ts)
- [`WalletOperationsHandler`](./agent/helpers/walletOperationsHandler.ts)
- [`OrderToolWrapper`](./agent/helpers/orderToolWrapper.ts)
- [`XMTPClientFactory`](./agent/helpers/xmtpClientFactory.ts)

**AI Agent System:**

The system uses two specialized LangGraph agents:

1. **Shopping Agent** ([`shopping/agent.ts`](./agent/lib/agents/shopping/agent.ts)) - Natural product search and ordering
2. **Profile Agent** ([`profile/agent.ts`](./agent/lib/agents/profile/agent.ts)) - User profile management and preferences

Each agent has custom tools, prompts, and conversation flows optimized for their domain.

**Agent Tools:**
- [`Order Tools`](./agent/lib/tools/order.ts) - Product search and order placement
- [`Profile Tools`](./agent/lib/tools/profile.ts) - User profile management
- [`Onchain Tools`](./agent/lib/tools/onchain.ts) - Wallet operations and balance checks

> **Network Simplification:** While the payment server supports multiple networks, the XMTP agent is configured to work primarily with Base Sepolia and USDC on Base Sepolia for simplicity. This reduces complexity in wallet operations and balance checks while maintaining the core functionality. Additional networks can be added by extending the onchain tools and wallet configuration.

### x402 Payment Server Architecture

The payment server implements a custom x402 facilitator pattern:

**Core Components:**

```javascript
// Server foundation
server.js          // Express app with x402 middleware
                  // -> server/src/server.js

config/index.js    // Multi-network configuration management
                  // -> server/src/config/index.js

// Business logic
routes/orders.js   // Order creation and status endpoints
                  // -> server/src/routes/orders.js

services/crossmint.js  // Amazon order placement via Crossmint
                      // -> server/src/services/crossmint.js

// Supporting infrastructure
utils/logger.js    // Structured logging for debugging
                  // -> server/src/utils/logger.js
```

**Direct File Links:**
- [`server.js`](./server/src/server.js) - Express app with x402 middleware
- [`config/index.js`](./server/src/config/index.js) - Multi-network configuration
- [`routes/orders.js`](./server/src/routes/orders.js) - Order endpoints
- [`services/crossmint.js`](./server/src/services/crossmint.js) - Crossmint integration
- [`utils/logger.js`](./server/src/utils/logger.js) - Logging utilities

> **Network Configuration Note:** The payment server supports multi-network configuration for USDC across Ethereum, Base, Polygon, and Arbitrum testnets. However, the XMTP agent currently manages only Base Sepolia and USDC on Base Sepolia to keep the implementation simpler. This can be easily extended to support additional networks as needed.

> **💡 Multi-Currency Payment Support**
>
> **Current limitation**: x402 protocol restricts payments to EIP-3009 tokens (USDC only). For multi-currency support, you'll need to bypass x402.
>
> **The details**:
> - x402 enables gasless payments but only supports USDC
> - Crossmint APIs are chain/token agnostic—they work with any token you throw at them
> - To accept other tokens: remove the 402 server response code and let API calls go through directly
>
> **Implementation**: Skip the x402 middleware for multi-currency flows. Your users will handle gas fees, but you gain full token flexibility.
>
> **Need help with this setup?** [Contact our team](mailto:support@crossmint.io)—we've helped other developers implement multi-currency flows and can walk you through the specifics.

**Payment Flow Design:**

1. **Initial Request** - Client sends order without payment
2. **402 Response** - Server returns payment requirements
3. **Payment Retry** - Client includes x402 payment header
4. **Order Fulfillment** - Server processes payment and places Amazon order

### System Sequence Flow

```mermaid
sequenceDiagram
    participant User
    participant XMTP as XMTP Protocol
    participant Agent as XMTP Agent
    participant Redis as Redis Cache
    participant Claude as Claude AI
    participant SerpAPI as SerpAPI
    participant Server as x402 Server
    participant Crossmint as Crossmint API
    participant Amazon as Amazon

    %% Initial Product Search
    User->>XMTP: "I want wireless earbuds"
    XMTP->>Agent: Message received
    Agent->>Redis: Get user profile
    Redis-->>Agent: User data/empty
    Agent->>Claude: Process message intent
    Claude-->>Agent: Product search needed
    Agent->>SerpAPI: Search "wireless earbuds"
    SerpAPI-->>Agent: Product results
    Agent->>Claude: Format response with products
    Claude-->>Agent: Formatted product list
    Agent->>XMTP: Send product options
    XMTP->>User: Display products with prices

    %% Order Initiation
    User->>XMTP: Click "Buy AirPods Pro"
    XMTP->>Agent: Order button clicked
    Agent->>Redis: Check user profile completeness
    Redis-->>Agent: Missing shipping info
    Agent->>XMTP: Request shipping details
    XMTP->>User: "Need shipping address"
    User->>XMTP: Provides address details
    XMTP->>Agent: Address received
    Agent->>Redis: Store user profile
    Agent->>Agent: Generate deterministic wallet
    Agent->>Agent: Check USDC balance (multiple networks)

    alt User has sufficient USDC
        Agent->>Server: POST /api/orders (no payment)
        Server-->>Agent: 402 Payment Required + details
        Agent->>Agent: Generate EIP-3009 permit signature
        Agent->>Server: POST /api/orders (with X-PAYMENT header)
        Server->>Server: Validate signature
        Server->>Crossmint: Create Amazon order
        Crossmint->>Amazon: Place order with user details
        Amazon-->>Crossmint: Order confirmation
        Crossmint->>Crossmint: Execute permit (transfer USDC)
        Crossmint-->>Server: Order success + tracking
        Server-->>Agent: Order confirmation
        Agent->>Redis: Store order details
        Agent->>XMTP: Order success message
        XMTP->>User: "Order placed! Tracking: XYZ"
    else User needs funding
        Agent->>XMTP: Request funding
        XMTP->>User: "Send USDC to: 0xabc..."
        User->>User: Sends USDC to wallet
        Agent->>Agent: Detect incoming USDC
        Agent->>XMTP: Auto-notify funding received
        XMTP->>User: "Payment received! Processing..."
        Note over Agent: Resume order flow from payment
    end

    %% Order Status Check
    User->>XMTP: "Where's my order?"
    XMTP->>Agent: Status request
    Agent->>Redis: Get order details
    Redis-->>Agent: Order ID
    Agent->>Server: GET /api/orders/{id}/status
    Server->>Crossmint: Check order status
    Crossmint-->>Server: Shipping status
    Server-->>Agent: Current status
    Agent->>XMTP: Status update
    XMTP->>User: "Out for delivery by 8 PM"
```


***Yes, that sequence diagram looks like a distributed systems horror story at first glance—we get it. Nine different services for buying earbuds feels like overkill until you realize each one handles exactly one thing well, and the magic happens in the orchestration. The complexity is all hidden behind simple conversation, which is exactly the point.***



### Data Flow Between Services

```mermaid
graph LR
    A[XMTP Message] --> B[Agent Processing]
    B --> C[Order Decision]
    C --> D[Payment Server]
    D --> E[Crossmint]
    E --> F[Amazon]

    G[Redis] -.-> B
    H[Claude AI] -.-> B
    I[Wallet Signature] -.-> D
    J[x402 Protocol] -.-> D
    K[Treasury] -.-> E
    L[Shipping] -.-> F

    style A fill:#e1f5fe
    style F fill:#e8f5e8
    style B fill:#fff3e0
    style D fill:#fce4ec
```

The beauty is in the orchestrationeach component handles its specialized role while maintaining the illusion of simple conversation.

---

## Step-by-Step Deployment

### Step 1: Clone and Setup Workspace

```bash
# Get the code
git clone <repository-url>
cd worldstore-agent

# Install dependencies for both services
pnpm install

# Verify workspace structure
ls -la
# You should see: agent/ server/ package.json pnpm-workspace.yaml
```

### Step 2: Configure the XMTP Agent

First, let's set up the conversational AI component:

```bash
cd agent
cp .env.template .env
```

Edit `agent/.env` with your configuration:

```bash
# AI Configuration - Get from Anthropic Console
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Generate XMTP keys (we'll do this next)
WALLET_KEY=0x1234abcd...
ENCRYPTION_KEY=your-32-byte-hex-encryption-key
XMTP_ENV=dev

# Backend Integration
WORLDSTORE_API_URL=http://localhost:3000

# Product Search - Get from SerpAPI
SERPAPI_API_KEY=your-serpapi-key

# Wallet Generation - Use any Ethereum private key
WALLET_PRIVATE_KEY=0x...
RPC_PROVIDER_URL=https://ethereum-sepolia.publicnode.com

# Redis - Use Redis Cloud or local instance
REDIS_URL=redis://localhost:6379
```

**Generate XMTP Keys:**

```bash
# Generate wallet and encryption keys
pnpm gen:keys

# This creates keys and shows you the values to add to .env
# Copy the output into your .env file
```

**Verify Agent Configuration:**

```bash
# Test the agent setup
pnpm type:check
# Should complete without errors
```

### Step 3: Configure the Payment Server

Navigate to the server directory:

```bash
cd ../server
cp .env.template .env
```

Edit `server/.env` with your Crossmint configuration:

```bash
# Crossmint Configuration - Get from Crossmint Console
CROSSMINT_API_KEY=your_crossmint_api_key
CROSSMINT_ENVIRONMENT=staging
CROSSMINT_WALLET_ADDRESS=your_wallet_address
CROSSMINT_WALLET_LOCATOR=your_wallet_locator

# Order Configuration
ORDER_FEE_PERCENTAGE=0
ORDER_PAYMENT_TIMEOUT_MINUTES=10

# Network Support - Customize based on your needs
CUSTOM_MIDDLEWARE_NETWORKS=ethereum-sepolia,base-sepolia,polygon-mumbai,arbitrum-sepolia
CUSTOM_MIDDLEWARE_CURRENCIES=usdc

# Server Configuration
PORT=3000
NODE_ENV=development
DEBUG=false
```

**Verify Server Configuration:**

```bash
# Test server startup
pnpm start

# Should see:
# => x402 + Crossmint API Server started
# => Running on: http://localhost:3000
```

### Step 3.5: Docker Setup (If Using Docker for Redis)

Before running Redis with Docker, ensure Docker Desktop is running:

**Install Docker Desktop (if not already installed):**
1. Download from [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/)
2. Install and launch Docker Desktop
3. Wait for Docker to fully start (Docker icon should be stable in your menu bar)

**Verify Docker is Running:**
```bash
# Check Docker version
docker --version
# Should return: Docker version 20.x.x or higher

# Test Docker daemon
docker info
# Should return system information without errors
```

**Common Issues:**
- **"Cannot connect to Docker daemon"** → Launch Docker Desktop and wait for it to start
- **"Command not found: docker"** → Restart terminal after Docker Desktop installation
- **Permission denied** → On Linux, add your user to the docker group: `sudo usermod -aG docker $USER`

### Step 4: Start Redis (If Running Locally)

```bash
# Option 1: Docker (Recommended)
docker run -d --name worldstore-redis -p 6379:6379 redis/redis-stack:latest

# Option 2: Local installation
redis-server

# Test Redis connection
redis-cli ping
# Should return: PONG
```

### Step 5: Launch Both Services

In your root directory:

```bash
# Start both services in development mode
pnpm dev

# This runs:
# - Agent on XMTP protocol (no HTTP port)
# - Server on http://localhost:3000
```

**Verify Everything is Running:**

```bash
# Check server health
curl http://localhost:3000/health

# Should return:
# {
#   "status": "healthy",
#   "timestamp": "2024-01-20T10:30:00.000Z",
#   "version": "1.0.0",
#   "environment": "development"
# }

# Check agent logs - should show:
# XMTP Shopping Bot initialized
# Listening for messages...
```

Perfect! Both services are now running and ready to process orders.

---

## Payment Flow End-to-End

Understanding the payment flow is crucial for debugging and extending the system. Here's what happens when a user wants to buy something:

### Phase 1: Order Initiation

**User Action:** "I want to buy AirPods Pro"

```
1. User sends XMTP message
2. Agent processes with Claude AI
3. SerpAPI searches Amazon for products
4. Agent presents options with prices
5. User confirms selection
```

**Behind the scenes:**
- Agent calls `search_product` tool with user's query
- SerpAPI returns Amazon product data (ASIN, price, reviews)
- Agent formats response with product details and order button

### Phase 2: Payment Preparation

**User Action:** Clicks "Buy Now" button

```
1. Agent checks user profile completeness
2. Agent calls `order_product` tool
3. System generates deterministic wallet for user
4. Agent checks USDC balance across networks
5. If insufficient funds, requests funding
```

**The wallet magic:**
```typescript
// Deterministic wallet generation
const userWallet = generateUserWallet(userInboxId, masterPrivateKey);
// Same inbox ID always generates the same wallet
// No seed phrases, no wallet apps, no complexity

// Implementation:
// -> agent/helpers/generateUserPrivateKey.ts
// -> agent/helpers/getWalletClientForUser.ts
// -> agent/helpers/wallet.ts (createUserWallet)
```

**Implementation Details:**
- [`generateUserPrivateKey.ts`](./agent/helpers/generateUserPrivateKey.ts) - Creates deterministic private keys using SHA256(masterKey + inboxId)
- [`getWalletClientForUser.ts`](./agent/helpers/getWalletClientForUser.ts) - Main function that orchestrates wallet creation
- [`wallet.ts`](./agent/helpers/wallet.ts) - Contains `createUserWallet` function for Viem wallet client creation

### Phase 3: x402 Payment Protocol

**Agent Action:** Places order with payment server

```
1. Agent calls x402 server: POST /api/orders (without payment)
2. Server returns 402 Payment Required with payment details
3. Agent generates EIP-3009 permit signature (gasless!)
4. Agent retries request with X-PAYMENT header
5. Server validates signature and processes payment
```

**Code Implementation:**

**Agent Side (Order Processing):**
- [`lib/tools/order.ts`](./agent/lib/tools/order.ts) - `order_product` tool that initiates the payment flow
- [`helpers/orderToolWrapper.ts`](./agent/helpers/orderToolWrapper.ts) - Wraps order placement with payment logic
- [`helpers/payment.ts`](./agent/helpers/payment.ts) - Core payment processing and x402 client implementation

**Server Side (x402 Protocol):**
- [`server/src/routes/orders.js`](./server/src/routes/orders.js) - POST /api/orders endpoint with 402 handling
- [`server/src/server.js`](./server/src/server.js) - Express app with x402 middleware setup
- [`server/src/services/crossmint.js`](./server/src/services/crossmint.js) - EIP-3009 permit validation and order placement
- [`server/src/config/index.js`](./server/src/config/index.js) - x402 network and contract configuration

**The gasless transaction:**
```typescript
// EIP-3009 permit - user signs intent to pay, no gas required
const domain = {
  name: "USDC",
  version: "2",
  chainId: 84532, // Base Sepolia
  verifyingContract: paymentRequirements.asset as `0x${string}`,
};

const types = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

const authorization = {
  from: userWallet.account.address,
  to: paymentRequirements.payTo,
  value: BigInt(paymentRequirements.maxAmountRequired),
  validAfter: BigInt(0),
  validBefore: BigInt(now + 3600), // 1 hour validity
  nonce: `0x${randomBytes(32).toString("hex")}`, // Random nonce
};

const signature = await userWallet.signTypedData({
  account: userWallet.account,
  domain,
  types,
  primaryType: "TransferWithAuthorization",
  message: authorization,
});
```

**Implementation Details:**

**Agent Side (Signature Generation):**
- [`helpers/payment.ts:94-167`](./agent/helpers/payment.ts#L94-L167) - Complete EIP-3009 signature generation
  - Lines 94-99: EIP-712 domain setup for USDC contract
  - Lines 102-111: TransferWithAuthorization type definitions
  - Lines 113-124: Authorization message construction with nonce and validity
  - Lines 161-167: Viem signTypedData call

**Server Side (Signature Validation & Execution):**
- [`services/crossmint.js:291-319`](./server/src/services/crossmint.js#L291-L319) - EIP-3009 execution via Crossmint
  - Lines 300-314: Signature parsing and v-value normalization for USDC
  - Lines 293-298: Authorization validation and logging

### Phase 4: Order Fulfillment

**Server Action:** Processes payment and places Amazon order

```
1. Server validates EIP-3009 signature
2. Server calls Crossmint API to create Amazon order
3. Crossmint executes permit and transfers USDC to treasury
4. Crossmint places order on Amazon with user's shipping info
5. Server returns order confirmation to agent
6. Agent notifies user of successful purchase
```

**Code Implementation:**

**Server Side (Order Processing & Fulfillment):**
- [`server/src/routes/orders.js:129-142`](./server/src/routes/orders.js#L129-L142) - Crossmint order creation
- [`server/src/routes/orders.js:234-289`](./server/src/routes/orders.js#L234-L289) - Payment verification and order fulfillment
- [`server/src/routes/orders.js:274-328`](./server/src/routes/orders.js#L274-L328) - Order execution with error handling
- [`server/src/services/crossmint.js:63-85`](./server/src/services/crossmint.js#L63-L85) - `createOrder()` method for Amazon orders
- [`server/src/services/crossmint.js:291-400`](./server/src/services/crossmint.js#L291-L400) - `executeTransferWithAuthorization()` for EIP-3009

**Agent Side (Order Confirmation):**
- [`agent/lib/tools/order.ts:16-17`](./agent/lib/tools/order.ts#L16-L17) - `processPayment()` import and usage
- [`agent/helpers/saveUserOrderId.ts`](./agent/helpers/saveUserOrderId.ts) - Store order ID for tracking

### Phase 5: Order Tracking

**Ongoing:** User can check order status anytime

```
1. User asks "Where's my order?"
2. Agent calls: GET /api/orders/{orderId}/status
3. Server queries Crossmint for latest status
4. Agent reports shipping status to user
```

**Code Implementation:**

**Agent Side (Order Status Tools):**
- [`agent/lib/tools/order.ts:196-226`](./agent/lib/tools/order.ts#L196-L226) - `order_status` tool implementation
- [`agent/helpers/loadUserOrders.ts`](./agent/helpers/loadUserOrders.ts) - Load user's order history from Redis
- [`agent/services/redis.ts:249-258`](./agent/services/redis.ts#L249-L258) - Redis order storage and retrieval

**Server Side (Status Endpoints):**
- [`server/src/routes/orders.js:350-400`](./server/src/routes/orders.js#L350-L400) - GET /api/orders/:orderId/status endpoint
- [`server/src/services/crossmint.js:400-450`](./server/src/services/crossmint.js#L400-L450) - Crossmint order status queries

**Agent Side (Status Display):**
- [`agent/helpers/intentHandlers.ts`](./agent/helpers/intentHandlers.ts) - Handle "where's my order" intents
- [`agent/lib/types.ts`](./agent/lib/types.ts) - Order status type definitions

**What's brilliant about this flow:**

- **No gas fees** - Users only sign permits, treasury pays gas
- **No wallet setup** - Wallets generated deterministically from XMTP identity
- **No token switching** - Works with USDC across multiple networks
- **No complexity** - User experience is just conversation

> **💡 Multi-Currency Payment Support**
>
> **Current limitation**: x402 protocol restricts payments to EIP-3009 tokens (USDC only). For multi-currency support, you'll need to bypass x402.
>
> **The details**:
> - x402 enables gasless payments but only supports USDC
> - Crossmint APIs are chain/token agnostic—they work with any token you throw at them
> - To accept other tokens: remove the 402 server response code and let API calls go through directly
>
> **Implementation**: Skip the x402 middleware for multi-currency flows. Your users will handle gas fees, but you gain full token flexibility.
>
> **Need help with this setup?** [Contact our team](mailto:support@crossmint.io)—we've helped other developers implement multi-currency flows and can walk you through the specifics.

---

## User Experience Walkthrough

Let's follow Sarah, a crypto newcomer, through her first purchase:

### Sarah's First Message

**Sarah:** "Hey, I need wireless earbuds for working out"

**Agent Response:**
```
I found some solid workout earbuds for you! Here are the top picks:

1. AirPods Pro (2nd Gen) - $179
   - Sweat/water resistant, great noise canceling
   - 30hr battery life, secure fit
   - Rating 4.5/5 (50K reviews)

2. Beats Fit Pro - $149
   - Specifically designed for workouts
   - Secure-fit wingtips, 24hr battery
   - Rating 4.4/5 (15K reviews)

Which one looks good? I can get either shipped to you.
```

**What happened behind the scenes:**
1. XMTP received Sarah's message
2. Agent classified intent as "product search"
3. Called SerpAPI with "wireless earbuds workout"
4. AI filtered results for workout-specific features
5. Formatted response with key details users care about

### Profile Setup (First-Time User)

**Sarah:** "I'll take the AirPods Pro"

**Agent Response:**
```
Great choice! The AirPods Pro are fantastic for workouts.

I'll need a few details to ship these to you:

=> Quick Setup:
1 Full Name:
2 Email:
3 Shipping Address:

Just tell me and I'll get your profile set up.
```

**Sarah:** "Sarah Johnson, sarah@email.com, 123 Main St, Seattle WA 98101"

**Agent Response:**
```
Perfect! Profile created!

=> Order Summary:
- AirPods Pro (2nd Gen) - $179
- Shipping: FREE
- Total: $179 USDC

Ready to complete your order?
```

**Behind the scenes:**
1. Agent detected missing profile information
2. Called `edit_profile` tool to store Sarah's details
3. Validated shipping address format
4. Prepared order with Crossmint-compatible address format

### The Payment Magic

**Sarah:** Clicks "Complete Order" button

**Agent Response:**
```
Checking your payment options...

Perfect! I found $200 USDC in your wallet on Base.

=> Payment Request:
I'm sending you a transaction to approve for $179 USDC.

[Transaction Request Sent]
- Amount: 179 USDC
- To: Treasury Wallet (0x789...)
- Network: Base Sepolia
- Purpose: AirPods Pro (2nd Gen) Purchase

Please approve this transaction in your wallet to complete your order.
```

**What's happening:**
1. Agent generated Sarah's deterministic wallet
2. Checked USDC balance across all supported networks
3. Found sufficient funds ($200 USDC on Base)
4. Sent XMTP transaction request using wallet_sendCalls codec
5. User receives an interactive transaction approval in their XMTP client

**Sarah's XMTP Client displays:**
```
🔔 Transaction Request from Worldstore Agent

💰 Transfer 179 USDC on Base
To: 0x789...def (Treasury Wallet)
Purpose: AirPods Pro (2nd Gen) Purchase

[Approve] [Reject]
```

### Transaction Approval and Completion

**Sarah:** Clicks "Approve" on the transaction request in her XMTP client

**Agent Response (automatic):**
```
=> Payment received! $200 USDC detected on Base.

=> Completing your order...

-> Order confirmed!

=> Order Details:
- Order ID: CM_789abc
- AirPods Pro (2nd Gen) - $179
- Shipping: 2-3 business days
- Tracking will be sent to sarah@email.com
```

**The seamless magic:**
1. User approved XMTP transaction request with one click
2. Agent received approval and initiated payment flow
3. Generated EIP-3009 permit signature (no gas fees!)
4. Called x402 server with signed payment
5. Server validated signature and called Crossmint
6. Crossmint executed permit and placed Amazon order
7. All happens in under 30 seconds after approval

**Technical Implementation:**
- XMTP `wallet_sendCalls` codec sends transaction request ([docs](https://docs.xmtp.org/inboxes/content-types/transactions#send-a-transaction-request))
- User approves via XMTP client UI (one-click approval)
- Agent receives approval event and processes payment
- EIP-3009 permit allows gasless USDC transfer

### Post-Purchase Experience

**Sarah (3 days later):** "Where's my package?"

**Agent Response:**
```
=> Your AirPods Pro order:

Status: Out for Delivery! =>
Tracking: 1Z999AA123456789
Expected: Today by 8 PM

You can track it here: [tracking link]

Need anything else?
```

**Later:**

**Sarah:** "These are amazing! Can you recommend a case?"

**Agent Response:**
```
Glad you love them! Here are some solid cases:

=> Apple MagSafe Case - $49
   - Perfect fit, wireless charging compatible

=> Spigen Tough Armor - $24
   - Drop protection, more budget-friendly

Want me to add one to your next order?
```

**This is the vision realized:**
- Natural conversation throughout
- No wallet complexity or gas fees
- Seamless repeat purchases
- Personalized recommendations based on history

---

## Production Considerations

### Security & Key Management

**Critical security practices for production deployment:**

**Environment Variable Security:**
```bash
# NEVER commit these to version control
ANTHROPIC_API_KEY=sk-ant-...
WALLET_KEY=0x...
ENCRYPTION_KEY=...
CROSSMINT_API_KEY=...
```

Use proper secrets management:
- **Railway/Vercel**: Environment variables in dashboard
- **AWS**: Parameter Store or Secrets Manager
- **Kubernetes**: Sealed secrets or external-secrets-operator

**Wallet Security:**

**Recommended: Crossmint Smart Wallets**
For production deployments, consider using Crossmint Smart Wallets instead of managing private keys directly:
- **No private key management** - Crossmint handles wallet creation and security
- **Built-in gasless transactions** - Users don't need ETH for gas fees
- **Multi-chain support** - Works across Ethereum, Base, Polygon, Arbitrum
- **Email-based wallets** - Users can create wallets with just an email address
- **Enterprise-grade security** - Professional key management and custody

**Learn more:**
- [Crossmint Smart Wallets Overview](https://docs.crossmint.com/wallets/overview)

**If using deterministic wallets (current approach):**
- Master wallet private key should be generated offline
- Use hardware security modules (HSM) for production keys
- Implement key rotation for XMTP encryption keys
- Monitor wallet balances and set up alerts

### Scalability Architecture

**Redis Scaling:**
```bash
# Production Redis setup
REDIS_URL=rediss://username:password@redis-cluster-endpoint:6380

# Enable Redis clustering for high availability
REDIS_CLUSTER_NODES=redis1:6379,redis2:6379,redis3:6379
```

**Load Balancing:**
- XMTP agent: Scale horizontally with shared Redis state
- Payment server: Stateless, can run multiple instances behind load balancer
- Redis: Use Redis Cluster or managed service (Redis Cloud, AWS ElastiCache)

**Database Considerations:**
Current system uses Redis for everything. For production scale, consider:
- PostgreSQL for order history and user profiles
- Redis for session state and conversation context
- Separate read replicas for analytics queries

### Monitoring & Observability

**Essential Metrics to Track:**

```javascript
// Business metrics
- Orders per minute
- Conversion rate (messages to orders)
- Average order value
- User retention rate

// Technical metrics
- XMTP message processing latency
- Redis response times
- Payment server error rates
- Anthropic API latency and token usage

// Infrastructure metrics
- CPU/Memory usage across services
- Network latency between services
- Redis memory usage and hit rates
```

**Logging Strategy:**
```javascript
// Structured logging with correlation IDs
logger.info('Order processing started', {
  userInboxId: 'user123',
  orderId: 'CM_789abc',
  orderValue: 179.00,
  paymentNetwork: 'base',
  correlationId: 'req_abc123'
});
```

**Error Handling & Alerting:**
- Set up alerts for payment failures
- Monitor XMTP connection health
- Track unusual user behavior patterns
- Alert on API rate limit approaches

### Performance Optimization

**Agent Performance:**
- Implement conversation context caching
- Use connection pooling for Redis
- Batch XMTP message processing where possible
- Optimize AI prompts to reduce token usage

**Payment Server Performance:**
- Cache Crossmint order status responses
- Implement request deduplication
- Use database connection pooling
- Add response compression

**Network Optimization:**
- Deploy services in same region/VPC
- Use CDN for static assets
- Implement proper caching headers
- Monitor cross-service network latency

### Compliance & Legal

**Financial Regulations:**
- Implement KYC/AML procedures for large orders
- Report suspicious transaction patterns
- Maintain audit trails for all payments
- Consider money transmission licensing requirements

**Data Privacy:**
- Implement GDPR/CCPA compliance for user data
- Encrypt user profiles and conversation history
- Provide data export and deletion capabilities
- Regular security audits and penetration testing

**Platform Policies:**
- Ensure compliance with Amazon's terms of service
- Monitor for prohibited items and categories
- Implement age verification for restricted products
- Handle returns and refunds according to platform policies

---

## Troubleshooting Guide

### Common Issues & Solutions

#### XMTP Agent Won't Start

**Symptom:** Agent fails to initialize with wallet errors

```bash
# Check wallet key format
node -e "console.log(process.env.WALLET_KEY.length)"
# Should be: 66 (including 0x prefix)

# Validate encryption key
node -e "console.log(process.env.ENCRYPTION_KEY.length)"
# Should be: 64 (32 bytes in hex)

# Test XMTP connection
curl -X POST https://dev.xmtp.network/health
# Should return healthy status
```

**Solution:**
```bash
# Regenerate keys if invalid
pnpm gen:keys

# Copy new values to .env file
# Restart agent service
```

#### Redis Connection Failures

**Symptom:** User profiles not saving, conversation state lost

```bash
# Test Redis connectivity
redis-cli ping
# Should return: PONG

# Check Redis logs
redis-cli monitor
# Watch for connection attempts

# Test Redis from agent
node -e "
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);
redis.ping().then(console.log).catch(console.error);
"
```

**Solution:**
```bash
# Fix Redis URL format
REDIS_URL=redis://localhost:6379  # Local
REDIS_URL=rediss://user:pass@host:port  # Remote with SSL

# Ensure Redis has enough memory
redis-cli config get maxmemory
redis-cli config set maxmemory 1gb
```

#### Payment Server 402 Errors

**Symptom:** Orders fail with "Payment Required" but no payment details

```bash
# Check Crossmint configuration
curl -H "X-API-Key: $CROSSMINT_API_KEY" \
  https://staging.crossmint.com/api/v1-alpha2/wallets/$CROSSMINT_WALLET_LOCATOR

# Should return wallet details
```

**Common Crossmint Issues:**
```bash
# Wrong environment
CROSSMINT_ENVIRONMENT=staging  # or production

# Invalid wallet locator format
CROSSMINT_WALLET_LOCATOR=email:your-email@domain.com:polygon

# Missing API permissions
# Check Crossmint dashboard for API key permissions
```

#### Claude AI Token Limits

**Symptom:** Agent responses become slow or fail with rate limits

```bash
# Monitor token usage
grep "tokens" agent/logs/*.log | tail -20

# Check API key limits
curl -H "x-api-key: $ANTHROPIC_API_KEY" \
  https://api.anthropic.com/v1/messages \
  -d '{"max_tokens":1,"messages":[{"role":"user","content":"hi"}],"model":"claude-sonnet-4-20250514"}'
```

**Solutions:**
- Upgrade Anthropic API plan for higher limits
- Implement conversation context trimming
- Cache common responses to reduce API calls
- Use shorter, more focused prompts

#### Network-Specific Payment Issues

**Symptom:** Payments work on some networks but not others

```bash
# Check USDC contract addresses
node -e "
const config = require('./server/src/config');
console.log('Ethereum Sepolia USDC:', config.x402.getContractAddress('ethereum-sepolia'));
console.log('Base Sepolia USDC:', config.x402.getContractAddress('base-sepolia'));
"

# Verify user has USDC on the correct network
# Check block explorer for contract address
```

<details>
<summary><h2>🚀 Extension Opportunities</h2></summary>

### Enhanced AI Capabilities

**Multi-Product Comparisons:**
Current system handles one product at a time. Add tools for:
- Side-by-side product comparisons
- Bundle recommendations ("Customers also bought...")
- Price tracking and alerts
- Review sentiment analysis

**Personalized Shopping:**
- Machine learning for recommendation engines
- Purchase history analysis
- Seasonal and trend-based suggestions
- Budget tracking and spending insights

### Advanced Payment Features

**Subscription Management:**
```typescript
// Add recurring payment support
interface SubscriptionOrder {
  frequency: 'weekly' | 'monthly' | 'quarterly';
  maxAmount: number;
  autoRenew: boolean;
  products: ProductSubscription[];
}
```

**Multi-Currency Support:**
- ETH, BTC, and other cryptocurrency payments
- Stablecoin conversion (USDT, DAI, FRAX)
- DeFi yield integration for spare balances
- Cross-chain payment routing optimization

> **💡 Multi-Currency Payment Support**
>
> **Current limitation**: x402 protocol restricts payments to EIP-3009 tokens (USDC only). For multi-currency support, you'll need to bypass x402.
>
> **The details**:
> - x402 enables gasless payments but only supports USDC
> - Crossmint APIs are chain/token agnostic—they work with any token you throw at them
> - To accept other tokens: remove the 402 server response code and let API calls go through directly
>
> **Implementation**: Skip the x402 middleware for multi-currency flows. Your users will handle gas fees, but you gain full token flexibility.
>
> **Need help with this setup?** [Contact our team](mailto:support@crossmint.io)—we've helped other developers implement multi-currency flows and can walk you through the specifics.

**Payment Splitting:**
- Group purchases with friends
- Corporate expense management
- Family account hierarchies
- Gift card and credit integration

### Platform Integrations

**Social Commerce:**
- Collaborative wishlists
- Social proof in product recommendations
- Influencer affiliate integration

### Enterprise Features

**Business Account Management:**
```typescript
interface BusinessProfile extends UserProfile {
  companyName: string;
  taxId: string;
  purchaseOrderLimits: {
    daily: number;
    monthly: number;
    requiresApproval: number;
  };
  approvers: string[]; // Inbox IDs
}
```

**Advanced Analytics:**
- Purchase pattern analysis
- Cost center allocation
- Vendor management
- Compliance reporting

### Technical Enhancements

**Blockchain Integration:**
- NFT product certificates
- Loyalty token rewards
- Proof of purchase on-chain
- Supply chain transparency

**Performance Scaling:**
```typescript
// Message queue for order processing
interface OrderQueue {
  addOrder(order: OrderRequest): Promise<string>;
  processOrders(): Promise<void>;
  getOrderStatus(orderId: string): Promise<OrderStatus>;
}

// Caching layer for frequent queries
interface ProductCache {
  searchProducts(query: string): Promise<Product[]>;
  getProductDetails(asin: string): Promise<ProductDetails>;
  invalidateCache(pattern: string): Promise<void>;
}
```

**Advanced Security:**
- Multi-signature treasury management
- Hardware security module integration
- Zero-knowledge proof implementations
- Biometric authentication for high-value orders

### Integration Ecosystem

**API Marketplace:**
Build a platform where developers can add:
- Custom product catalogs
- Specialized AI agents
- Alternative payment methods
- Regional shipping providers

**Plugin Architecture:**
```typescript
interface WorldstorePlugin {
  name: string;
  version: string;
  endpoints: PluginEndpoint[];
  tools: PluginTool[];
  middlewares: PluginMiddleware[];
}
```

</details>

---

## Conclusion

You've just built something remarkable: a production-ready system that turns natural conversation into Amazon deliveries using cryptocurrency. Made possible through Crossmint's worldstore APIs, the XMTP messaging protocol and Coinbase's 402 protocol.

### What You've Accomplished

- **Deployed a dual-service architecture** that scales independently
- **Integrated five different APIs** into a cohesive user experience
- **Implemented gasless crypto payments** using EIP-3009 permits
- **Built conversational AI** that actually completes e-commerce transactions
- **Created deterministic wallets** that eliminate user onboarding friction

### The Bigger Picture

This system represents the future of crypto-commerce: invisible complexity, maximum utility. Users don't need to understand blockchain, manage private keys, or calculate gas fees. They just talk to an AI and receive packages.

### Your Next Steps

**Immediate Improvements:**
1. Add comprehensive monitoring and alerting
2. Implement proper CI/CD pipelines
3. Set up staging and production environments
4. Add comprehensive test coverage

### Community & Support

This guide represents hours of research, development, and testing. Made with ♥️ by the Crossmint team.

**Contributing Back:**
- Found improvements or bug fixes? Submit PRs
- Built interesting extensions? [Share them with the community](https://t.me/crossmintdevs)
- Discovered better practices? Update this documentation

### Final Thought

The intersection of AI, crypto, and e-commerce is just beginning. You've built a system at the forefront of this convergence. What users buy through natural conversation today will seem primitive compared to what's possible tomorrow.

Keep building. Keep pushing the boundaries. The future of commerce is conversational, crypto-native, and completely seamless.

Now go ship something amazing. 🚢🚢🚢‼️

---

*Built with ♥️ by the [Crossmint](https://crossmint.com) team. For questions, issues, or contributions, reach out through the repository or [join our community](https://t.me/crossmintdevs).*