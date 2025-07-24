# XMTP 402 Worldstore Agent

## what is it?
Demonstration of an XMTP bot that enables crypto-powered Amazon purchases through the x402 payment protocol and Crossmint's headless checkout APIs.

- Supported Network: Base (Sepolia & Mainnet)
- Supported Currency: USDC (`0x036CbD53842c5426634e7929541eC2318f3dCF7e` on Base Sepolia and `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` on Base Mainnet)
- Tech Stack
  - Client: XMTP
  - Bot framework: Langgraph
  - Backend: custom facilitator + crossmint API wrapper; returns 402 for `/order` API and calls Crossmint's APIs internally

## under the hood
- the bot has a deterministic wallet generated per user
- before being able to do anything the bot requires the user to set their: name, email, shipping address
- the system uses a unified shopping agent that handles all user interactions through specialized tools
- after deciding on a product (either searching or directly providing an ASIN code)
- the bot queries the x402 server (worldstore API endpoint)
  - makes initial POST to `/api/orders` with order details
  - receives a 402 Payment Required status
  - extracts payment requirements from the response
- the bot generates an EIP-712 signature for USDC authorization
  - creates `TransferWithAuthorization` signature using user's deterministic wallet
  - encodes payment payload with signature and authorization details
- the bot retries the order request with `X-PAYMENT` header containing the encoded payment
- the **x402 facilitator** processes the payment and completes the order
- the user gets an orderid that they can query to check order status

## available tools:
- **Profile Management**: `edit_profile`, `read_profile`
- **Shopping**: `search_product`, `order_product`
- **Order Tracking**: `get_user_order_history`, `get_order_status`
- **Onchain Operations**: GOAT SDK tools for wallet interactions

## workflow diagram

```mermaid
graph TD
    %% Main Message Flow
    START([START]) --> load_profile[Load User Profile<br/>- Check for existing profile<br/>- Load conversation history]

    load_profile --> create_agent[Create Shopping Agent<br/>- Initialize all tools<br/>- Set user context]

    create_agent --> shopping_node[Shopping Node<br/>- Process user request<br/>- Execute tools as needed<br/>- Generate response]

    shopping_node --> END([END])

    %% XMTP Message Layer
    subgraph XMTP_Layer ["📨 XMTP Message Layer"]
        message_receive[Receive Message] --> message_filter{Filter Message<br/>- Skip own messages<br/>- Text messages only}
        message_filter -->|Valid| sync_conversation[Sync Conversation<br/>- Load message history<br/>- Send 'thinking...' status]
        sync_conversation --> invoke_agent[Invoke Agent<br/>- Create initial state<br/>- Process through workflow]
        invoke_agent --> send_response[Send Response<br/>- Sync conversation<br/>- Ensure delivery]
    end

    %% Tools Available to Agent
    subgraph Tools ["🛠️ Available Tools"]
        profile_tools[Profile Tools<br/>- edit_profile<br/>- read_profile]
        shopping_tools[Shopping Tools<br/>- search_product<br/>- order_product]
        order_tools[Order Tools<br/>- get_user_order_history<br/>- get_order_status]
        goat_tools[GOAT SDK Tools<br/>- Onchain operations<br/>- Wallet interactions]
    end

    %% X402 Payment Flow (triggered by order_product)
    subgraph X402_Flow ["💳 x402 Payment Flow"]
        initial_request[POST /api/orders<br/>- Send order details]
        payment_required[Receive 402<br/>- Extract payment requirements]
        generate_signature[Generate EIP-712 Signature<br/>- USDC TransferWithAuthorization<br/>- Use deterministic wallet]
        retry_payment[Retry with X-PAYMENT<br/>- Include encoded payload<br/>- Complete order]

        initial_request --> payment_required
        payment_required --> generate_signature
        generate_signature --> retry_payment
    end

    %% State Management
    subgraph State ["📊 State Management"]
        user_profiles[User Profiles<br/>.data/user-profiles/<br/>JSON files with order history]
        deterministic_wallets[Deterministic Wallets<br/>Generated per user<br/>EIP-712 signing]
        conversation_state[Conversation State<br/>Message history<br/>Agent context]
    end

    %% Connections
    message_receive -.-> START
    shopping_node -.-> profile_tools
    shopping_node -.-> shopping_tools
    shopping_node -.-> order_tools
    shopping_node -.-> goat_tools
    order_tools -.-> X402_Flow
    profile_tools -.-> user_profiles
    goat_tools -.-> deterministic_wallets
    sync_conversation -.-> conversation_state

    %% Styling
    classDef mainFlow fill:#e1f5fe
    classDef xmtpFlow fill:#e8f5e8
    classDef toolsFlow fill:#fff3e0
    classDef paymentFlow fill:#fce4ec
    classDef stateFlow fill:#f3e5f5

    class START,load_profile,create_agent,shopping_node,END mainFlow
    class message_receive,message_filter,sync_conversation,invoke_agent,send_response xmtpFlow
    class profile_tools,shopping_tools,order_tools,goat_tools toolsFlow
    class initial_request,payment_required,generate_signature,retry_payment paymentFlow
    class user_profiles,deterministic_wallets,conversation_state stateFlow
```