# X402 Facilitator Server

> **The payment processor that makes "pay with crypto" actually work.** Turn USDC signatures into Amazon deliveries without the blockchain headaches.

This is where the magic happens - a custom x402 payment facilitator that bridges the gap between XMTP conversations and real-world commerce. It's the financial plumbing that turns cryptographic signatures into packages at your door.

## What This Solves

Ever tried to pay for something online with crypto? It usually goes like this:
1. Connect wallet (3 clicks)
2. Approve spending (transaction + gas)
3. Wait for confirmation (30 seconds of anxiety)
4. Actually pay (another transaction + more gas)
5. Hope the merchant's system doesn't timeout

**This server eliminates all of that.** Users sign once, gaslessly. The facilitator handles everything else.

## How x402 Actually Works

The x402 protocol is brilliantly simple:
1. **Client requests payment** → Server responds with 402 Payment Required
2. **Client signs authorization** → No blockchain interaction, just a signature
3. **Client retries with signature** → Server executes payment and fulfills order

Think of it as "crypto layaway" - users authorize payments that get executed later when needed.

```
Traditional Crypto Payment:          x402 Payment:
User → MetaMask popup                User → Sign once (gasless)
User → Approve transaction           Server → Execute when ready
User → Pay transaction              Server → Fulfill order
User → Wait for confirmations       User → Get product
User → Hope it works                
```

## Why Build a Custom Facilitator?

The official x402 facilitator works great... if you only care about Base. For everyone else building real applications, we needed:

- **Multi-network support** (Ethereum, Polygon, Arbitrum, not just Base)
- **Direct e-commerce integration** (Crossmint → Amazon)
- **Flexible fee structures** (because business models matter)
- **Production-ready error handling** (because things break)

## Architecture That Makes Sense

```
src/
├── config/          # Environment management (not another config framework)
├── routes/          # Express endpoints (REST API that works)
├── services/        # Business logic (Crossmint integration)
└── utils/           # Logging and helpers (actual useful utilities)
```

Clean, boring, and maintainable. Just how payment processing should be.

## 2-Minute Setup

### What You Need First
- **Node.js 18+** (because we're not savages)
- **Crossmint account** with API access (for Amazon fulfillment)
- **Crossmint treasury wallet** funded on your target networks
- **Basic understanding of EIP-3009** (or trust that it works)

### Environment Configuration

```bash
# Install and configure
npm install
cp .env.template .env
```

Your `.env` needs these essentials:

```bash
# Crossmint Integration (the important stuff)
CROSSMINT_API_KEY=your_crossmint_api_key
CROSSMINT_ENVIRONMENT=staging  # or production
CROSSMINT_WALLET_ADDRESS=0x...  # Your treasury wallet
CROSSMINT_WALLET_LOCATOR=your-wallet-locator

# x402 Configuration
CUSTOM_MIDDLEWARE_NETWORKS=ethereum-sepolia,base-sepolia,polygon-mumbai
CUSTOM_MIDDLEWARE_CURRENCIES=usdc

# Business Logic
ORDER_FEE_PERCENTAGE=0          # Additional fee (0% = no markup)
ORDER_PAYMENT_TIMEOUT_MINUTES=10 # How long payments stay valid

# Server Basics
PORT=3000
NODE_ENV=development
DEBUG=false  # Set true when things break
```

### Start the Server

```bash
# Development with auto-reload
npm run dev

# Production mode
npm start
```

**That's it.** Your x402 facilitator is now ready to turn crypto signatures into Amazon orders.

## The x402 Payment Dance

This is a two-step protocol that feels like one seamless flow:

### Step 1: Payment Requirements (402 Response)
Client asks to buy something, server responds with "Payment Required" and tells them exactly what to sign.

### Step 2: Payment Execution  
Client comes back with a signature, server executes the payment and fulfills the order.

That's it. No gas fees, no wallet connections, no blockchain anxiety.

## API Reference: The Important Parts

### Product Locators (What You Can Buy)

The API accepts flexible product references:

```
Amazon Products:
- amazon:B08N5WRWNW                                    # Direct ASIN
- amazon:https://www.amazon.com/dp/B01DFKC2SO         # Full URL

Shopify Products (future):
- shopify:https://store.com/products/item:variant-id   # Product + variant
```

### Order Creation: The 402 Flow

**POST** `/api/orders` (without X-PAYMENT header)

```json
{
  "productLocator": "amazon:B08N5WRWNW",
  "email": "user@example.com",
  "physicalAddress": {
    "name": "John Doe",
    "line1": "123 Main St",
    "city": "New York",
    "state": "NY",
    "postalCode": "10001",
    "country": "US"
  },
  "payment": {
    "method": "ethereum-sepolia",
    "currency": "usdc"
  }
}
```

**Response: 402 Payment Required**
```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [{
    "scheme": "exact",
    "network": "ethereum-sepolia",
    "maxAmountRequired": "1800000",  // 1.80 USDC (6 decimals)
    "payTo": "0x462...b87",          // Treasury wallet
    "asset": "0x1c7...238",          // USDC contract
    "maxTimeoutSeconds": 600,        // 10 minute timeout
    "extra": {
      "orderId": "cm_order_abc123"   // Track this order
    }
  }]
}
```

### Payment Execution: The Success

**POST** `/api/orders` (with X-PAYMENT header)

**Headers:**
```
X-PAYMENT: eyJ4NDAyVmVyc2lvbiI6MSwic2NoZW1lIjoi...  # Base64 payload
```

**X-PAYMENT Payload (before base64 encoding):**
```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "ethereum-sepolia",
  "payload": {
    "authorization": {
      "from": "0x1234...",           // User's wallet
      "to": "0x462...b87",           // Treasury wallet
      "value": "1800000",            // Exact USDC amount
      "validAfter": "0",             // Valid immediately
      "validBefore": "1703127056",   // Expires in 10 min
      "nonce": "0xabc123..."         // Unique nonce
    },
    "signature": "0xdef456..."       // EIP-712 signature
  },
  "extra": {
    "orderId": "cm_order_abc123"     // Match from 402 response
  }
}
```

**Success Response: 200 OK**
```json
{
  "message": "Payment received and order fulfilled successfully",
  "order": {
    "orderId": "cm_order_abc123",
    "quote": {
      "totalPrice": { "amount": "1.80", "currency": "USD" }
    }
  },
  "fulfillment": {
    "success": true,
    "data": { "id": "tx_123" }
  }
}
```

### Health Check (Because Monitoring Matters)

**GET** `/api/orders/facilitator/health`

Returns server status and network connectivity. Use this for monitoring.

## Network Support: The Reality

We support the networks that actually matter for commerce:

### Testnets (For Development)
| Network | USDC Contract | Why Use It |
|---------|---------------|------------|
| **Ethereum Sepolia** | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | Most compatible |
| **Base Sepolia** | `0x036cbd53842c5426634e7929541ec2318f3dcf7e` | Fastest/cheapest |
| **Polygon Mumbai** | `0xe6b8a5CF854791412c1f6EFC7CAf629f5Df1c747` | Alternative option |
| **Arbitrum Sepolia** | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` | L2 testing |

### Production Networks (For Real Money)
| Network | USDC Contract | Why Use It |
|---------|---------------|------------|
| **Ethereum** | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | Most liquidity |
| **Base** | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Cheapest fees |
| **Polygon** | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` | Alternative L2 |
| **Arbitrum** | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | Another L2 option |

## Treasury Wallet: The Critical Piece

Your Crossmint treasury wallet is the financial engine of this system:

### What It Does
- **Receives user USDC payments** via transferWithAuthorization
- **Pays for Amazon orders** through Crossmint
- **Handles the float** between payment and fulfillment

### Critical Requirements
- **Fund it properly** on each network you support
- **Monitor balances** - orders fail when wallets are empty
- **Secure the credentials** - this wallet handles real money

### Funding Strategy
```bash
# Example funding levels (adjust for your volume)
Ethereum: 10,000 USDC   # High-value orders
Base:      5,000 USDC   # Main volume
Polygon:   2,000 USDC   # Backup network
Arbitrum:  2,000 USDC   # Secondary L2
```

## Payment Flow Deep Dive

Here's what actually happens when someone buys something:

1. **Order Request** → XMTP agent sends order details
2. **Price Lookup** → Server queries Crossmint for current pricing
3. **402 Response** → Server tells agent exactly what payment is needed
4. **Signature Generation** → Agent creates EIP-3009 authorization
5. **Payment Submission** → Agent retries request with X-PAYMENT header
6. **Payment Execution** → Server calls transferWithAuthorization on USDC contract
7. **Order Fulfillment** → Server places order with Crossmint → Amazon
8. **Confirmation** → User gets order ID and email confirmation

The beauty is that steps 6-8 happen automatically once the signature is valid.

## Error Handling That Actually Helps

### Common Failure Modes

**Insufficient Treasury Funds:**
```json
{
  "error": "Treasury wallet insufficient balance on ethereum-sepolia",
  "details": "Need 1800000 USDC, have 500000 USDC"
}
```

**Invalid Signature:**
```json
{
  "error": "Payment authorization signature invalid",
  "details": "EIP-712 signature verification failed"
}
```

**Network Issues:**
```json
{
  "error": "Network ethereum-sepolia temporarily unavailable",
  "details": "RPC endpoint unresponsive, try base-sepolia"
}
```

**Order Fulfillment Failures:**
```json
{
  "error": "Crossmint order failed",
  "details": "Product unavailable or address invalid"
}
```

### Debug Mode

Enable detailed logging when things break:
```bash
DEBUG=true npm run dev
```

This logs:
- x402 protocol message parsing
- EIP-3009 signature verification steps
- Crossmint API requests/responses
- Network RPC calls and responses

## Security: The Non-Negotiable Parts

### Treasury Wallet Security
- **Never commit private keys** to version control
- **Use environment variables** for sensitive credentials
- **Monitor wallet balances** and transaction patterns
- **Set up alerts** for unusual activity

### Payment Validation
- **Verify signatures** against expected signer addresses
- **Check payment amounts** match order requirements exactly
- **Validate timeout windows** to prevent replay attacks
- **Rate limit** to prevent abuse

### Network Security
- **Use reputable RPC endpoints** in production
- **Have fallback RPC providers** for redundancy
- **Monitor network congestion** and adjust timeouts
- **Log all financial transactions** for audit trails

## Development Tools

### Payment Testing Script
```bash
# Generate a test payment signature
node scripts/generate-payment.mjs

# This creates a full x402 payment payload you can use for testing
```

### Environment Validation
```bash
# Check that all required env vars are set
npm run validate-env

# Verify treasury wallet connectivity
npm run check-wallets
```

### Production Checklist
- [ ] Treasury wallets funded on all target networks
- [ ] Crossmint API keys valid and active
- [ ] RPC endpoints configured with fallbacks
- [ ] Monitoring and alerting configured
- [ ] Error handling tested with invalid payments
- [ ] Rate limiting configured appropriately

## Why This Works

Traditional crypto payments fail because they put blockchain complexity on users. The x402 protocol moves that complexity to servers that can handle it properly.

Users sign once, gaslessly. Servers handle network fees, transaction timing, error recovery, and order fulfillment. The result feels like traditional payments but uses crypto settlement.

This server is the financial infrastructure that makes crypto-commerce feel normal. Your users get to focus on shopping, not blockchain mechanics.