# x402 + Crossmint Worldstore Integration

A **custom x402 facilitator** that enables cryptocurrency payments for Amazon products via Crossmint Worldstore.

## Overview

This service implements a custom [x402 payment protocol](https://docs.cdp.coinbase.com/x402/core-concepts/how-it-works) facilitator for [Crossmint Worldstore](https://docs.crossmint.com/worldstore) integration. It provides secure, multi-network cryptocurrency payments for Amazon product purchases.

### What is x402?

x402 enables secure, gasless cryptocurrency payments using EIP-3009 `transferWithAuthorization`. Users authorize payments that are executed later by the facilitator, eliminating gas fees.

### Why a Custom Facilitator?

The official x402 facilitator only supports Base networks. This custom implementation provides:
- **Multi-network support** (Ethereum, Base, Polygon, Arbitrum)
- **Dynamic network selection** per request
- **Seamless Crossmint integration**
- **Configurable fee structure**

## Prerequisites

- Node.js 18+
- **Crossmint Credentials**: Active Crossmint account with valid API scopes
- **Treasury Wallet Setup**: A Crossmint smart wallet created and configured as your treasury.
- **Network Funding**: Your Crossmint treasury wallet must be funded with sufficient float funds on each network you want to support (Ethereum Sepolia, Base Sepolia, etc.).

## Quick Start

### Installation

```bash
git clone <repository-url>
cd x402
npm install
```

### Configuration

Copy `env.template` to `.env` and configure:

```bash
# Crossmint Configuration
CROSSMINT_API_KEY=your_crossmint_api_key
CROSSMINT_ENVIRONMENT=staging  # or production
CROSSMINT_WALLET_ADDRESS=your_treasury_wallet_address
CROSSMINT_WALLET_LOCATOR=your_treasury_wallet_locator

# Custom x402 Facilitator Configuration
CUSTOM_MIDDLEWARE_NETWORKS=ethereum-sepolia,base-sepolia,polygon-mumbai,arbitrum-sepolia
CUSTOM_MIDDLEWARE_CURRENCIES=usdc

# Order Configuration
ORDER_FEE_PERCENTAGE=0  # additional fee percentage
ORDER_PAYMENT_TIMEOUT_MINUTES=10  # payment timeout

# Server Configuration
PORT=3000
NODE_ENV=development
DEBUG=false
```

### Start Server

```bash
npm start
```

## API Reference

### Product Locators

The API supports flexible product locators for different e-commerce platforms:

**Amazon Products:**
- `amazon:B08N5WRWNW` - Direct ASIN reference
- `amazon:https://www.amazon.com/dp/B01DFKC2SO` - Full Amazon URL

**Shopify Products:**
- `shopify:https://www.gymshark.com/products/gymshark-arrival-5-shorts-black-ss22:39786362601674` - Shopify product URL with variant ID

### Create Order (Step 1: Get Payment Requirements)

**Endpoint:** `POST /api/orders`

**Input:**
```json
{
  "productLocator": "amazon:B08N5WRWNW",
  "email": "user@example.com",
  "physicalAddress": {
    "name": "John Doe",
    "line1": "123 Main St",
    "line2": "Apt 4B",
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

**Response (402 Payment Required):**
```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "ethereum-sepolia",
      "maxAmountRequired": "1800000",
      "resource": "/api/orders",
      "description": "Amazon product purchase via Crossmint (includes 0% fee)",
      "mimeType": "application/json",
      "payTo": "0x462A377C745451B0FA24F5DCC13094D0b6BBfb87",
      "maxTimeoutSeconds": 600,
      "asset": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
      "extra": {
        "name": "USDC",
        "version": "2",
        "orderId": "cm_order_abc123"
      }
    }
  ]
}
```

### Complete Payment (Step 2: Execute Payment)

**Endpoint:** `POST /api/orders`

**Headers:**
```
X-PAYMENT: <base64-encoded-x402-payment-payload>
```

**X-PAYMENT Payload Structure:**
```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "ethereum-sepolia",
  "payload": {
    "authorization": {
      "from": "0x1234...",
      "to": "0x462A377C745451B0FA24F5DCC13094D0b6BBfb87",
      "value": "1800000",
      "validAfter": "1703123456",
      "validBefore": "1703127056",
      "nonce": "0xabc123..."
    },
    "signature": "0xdef456..."
  },
  "extra": {
    "orderId": "cm_order_abc123"
  }
}
```

**Success Response (200):**
```json
{
  "message": "Payment received and order fulfilled successfully, check your email for confirmation",
  "order": {
    "orderId": "cm_order_abc123",
    "locale": "en-US",
    "lineItems": [
      {
        "chain": "ethereum-sepolia",
        "metadata": {
          "productLocator": "amazon:B08N5WRWNW"
        },
        "delivery": {
          "recipient": {
            "email": "user@example.com",
            "physicalAddress": { ... }
          }
        },
        "quantity": 1
      }
    ],
    "quote": {
      "totalPrice": {
        "amount": "1.80",
        "currency": "USD"
      }
    }
  },
  "fulfillment": {
    "success": true,
    "data": {
      "id": "tx_123",
      "createdAt": "2024-01-01T12:00:00Z"
    }
  }
}
```

### Additional Endpoints

- `GET /api/orders/:orderId/status` - Check order status
- `GET /api/orders/facilitator/health` - Facilitator health check

## Payment Flow

1. **Generate Payment Authorization:**
   ```bash
   node scripts/generate-payment.mjs
   ```

2. **Complete the Payment:**
   ```bash
   curl -X POST http://localhost:3000/api/orders \
     -H "Content-Type: application/json" \
     -H "X-PAYMENT: <generated-base64-payload>" \
     -d '{ "productLocator": "amazon:B08N5WRWNW", "email": "user@example.com", ... }'
   ```

## Supported Networks

### Testnets
| Network | USDC Contract | RPC Endpoint |
|---------|---------------|--------------|
| Ethereum Sepolia | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | `https://ethereum-sepolia-rpc.publicnode.com` |
| Base Sepolia | `0x036cbd53842c5426634e7929541ec2318f3dcf7e` | `https://base-sepolia-rpc.publicnode.com` |
| Polygon Mumbai | `0xe6b8a5CF854791412c1f6EFC7CAf629f5Df1c747` | `https://polygon-mumbai-rpc.publicnode.com` |
| Arbitrum Sepolia | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` | `https://arbitrum-sepolia-rpc.publicnode.com` |

### Production
| Network | USDC Contract | RPC Endpoint |
|---------|---------------|--------------|
| Ethereum | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | `https://ethereum.publicnode.com` |
| Base | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | `https://mainnet.base.org` |
| Polygon | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` | `https://polygon-rpc.com` |
| Arbitrum | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | `https://arb1.arbitrum.io/rpc` |

## Key Features

- **Multi-Network Support**: Ethereum, Base, Polygon, Arbitrum (testnet + mainnet)
- **Dynamic Network Selection**: Choose network per request
- **EIP-3009 Integration**: Secure transferWithAuthorization payments
- **Crossmint Worldstore**: Seamless Amazon product fulfillment
- **Fee Management**: Configurable fee calculation and collection
- **Production Ready**: Complete payment flow from 402 to fulfillment

## Security Considerations

- **Treasury Wallet Funding**: Ensure your Crossmint treasury wallet has sufficient funds on each supported network to cover order fulfillment until user payments settle
- **API Key Security**: Secure your Crossmint API key and wallet credentials
- **Network Security**: Use secure RPC endpoints in production
- **Error Handling**: Implement proper error recovery mechanisms

## Development

### Project Structure
```
src/
├── config/          # Configuration management
├── routes/          # API route handlers
├── services/        # Crossmint and x402 integration
└── utils/           # Logging and utilities
```

### Testing
```bash
node scripts/generate-payment.mjs
```

Enable verbose debug logging by setting `DEBUG=true` in your environment.