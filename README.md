# Smile Oracle Core (`smile-oracle-core`)

> **Decentralized Affective Computing Oracle & Micro-Incentive Attestation Engine on Base Network**

`smile-oracle-core` is an on-chain/off-chain hybrid verification protocol that authenticates human emotional expressions (Proof-of-Smile) via computer vision and AI Oracles, programmatically settling cryptographic attestations and streaming micro-incentive USDC rewards on Base Network.

---

## 🏛️ System Architecture

```
                      +-----------------------------------+
                      |      Client User Interface        |
                      |  (Next.js 14 / TypeScript / WAGMI)|
                      +-----------------+-----------------+
                                        |
               Webcam Stream / Media Ingestion & Compression
                                        |
                                        v
                       +----------------+----------------+
                       |   Optimized Payload Dispatcher  |
                       +----------------+----------------+
                                        |
            +---------------------------+---------------------------+
            |                                                       |
            v                                                       v
+-----------+-----------+                               +-----------+-----------+
| Base Network Contract |                               | Off-Chain AI Oracle   |
|   (SmilePlease.sol)   |                               |  Inference Service    |
+-----------+-----------+                               +-----------+-----------+
      |     |                                                       |
      |     | 1. analyzeSmile{value: fee}(url)                      |
      |     |                                                       |
      |     +--------------------> IAIOracle.requestAIResponse()     |
      |                                                             |
      |                                2. Vision Feature Extraction |
      |                                   & Expression Scoring      |
      |                                   (Scale: 1 - 5)            |
      |                                                             |
      | 3. handleAIResponse(requestId, prompt, response)            |
      |<------------------------------------------------------------+
      |
      +---- Score Check (score > 3):
            ├── TRUE  ==> IERC20.transfer(recipient, 0.001 USDC)
            │             Emit SmileAnalysisReceived(..., score)
            └── FALSE ==> Log Score & Settle Attestation
```

---

## 🔬 Technical Specifications

### 1. Smart Contract Architecture (`contracts/smilePlease.sol`)

The protocol uses an asynchronous Oracle callback pattern built to interface with CDP (Coinbase Developer Platform) and Openputer AI Oracles:

- **`IAIOracle`**: Interface defining oracle payment queries (`fee()`), request dispatching (`requestAIResponse(string prompt)`), and state polling.
- **`analyzeSmile(string memory photoUrl)`**: 
  - Verifies `msg.value >= oracleFee`.
  - Serializes a structured prompt with scoring parameters into bytes:
    ```solidity
    string memory prompt = string(
        abi.encodePacked(
            "Photo URL: ", photoUrl, "\n",
            "Task: Score the smile in this photo\n",
            "Scale: 1 to 5 (1 = no smile, 5 = genuine teethy smile)\n",
            "Instructions: Respond with ONLY a single number between 1-5"
        )
    );
    ```
  - Emits `SmileAnalysisRequested(bytes32 indexed requestId, string photoUrl)`.
- **`handleAIResponse(bytes32 requestId, string memory prompt, string memory response)`**:
  - Strict caller access control (`msg.sender == address(aiOracle)`).
  - ASCII-to-integer parser validating scalar range `[1, 5]`.
  - Conditional reward execution (`score > 3`) invoking `IERC20.transfer(tx.origin, rewardAmount)`.
  - Emits `SmileAnalysisReceived(requestId, photoUrl, smileScore)`.

### 2. Off-Chain AI Oracle & Inference Engine (`app/api/analyze-smile/route.ts`)

- **Inference Pipeline**: Multi-modal vision analysis inspecting zygomaticus major muscle engagement and teeth exposure.
- **Provider Redundancy**: Pluggable vision engine supporting OpenAI Vision models (`gpt-4o-mini`) with deterministic fallback heuristics.
- **Cryptographic Request ID**: Every analysis run generates a cryptographically random `bytes32` identifier matching on-chain event schemas.

### 3. Client & Web3 Abstraction Layer (`lib/auth.tsx`)

- **Dual-State Authentication**: Supports instant sandbox testing (zero-configuration simulated Base wallet) and live injected EIP-1193 providers (MetaMask, Coinbase Wallet, Privy).
- **Network Enforcement**: Automated detection and switching for Base Mainnet (Chain ID `8453`).
- **Resilient Storage Subsystem**: Unified data adapter abstracting Supabase PostgreSQL / Storage and client-side offline persistence.

---

## ⚡ Quick Start

### Prerequisites
- **Node.js**: `>= 18.0.0`
- **npm** or **pnpm**

### Installation
```bash
git clone https://github.com/RajvardhanS-Patil/smile-oracle-core.git
cd smile-oracle-core
npm install --legacy-peer-deps
```

### Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

### Production Build
```bash
npm run build
npm run start
```

---

## ⚙️ Environment Configuration

Copy `.env.example` to `.env.local` to configure optional production endpoints:

```bash
cp .env.example .env.local
```

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_PRIVY_APP_ID` | String | No | Privy application ID for embedded authentication |
| `NEXT_PUBLIC_SUPABASE_URL` | String | No | Supabase project instance URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | String | No | Supabase anonymous public API key |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | Address | No | Deployed `SmilePlease` contract on Base |
| `OPENAI_API_KEY` | String | No | Vision API key for dynamic off-chain scoring |

*Note: If no environment variables are provided, the system defaults to local sandbox mode with instant wallet simulation.*

---

## 📦 Directory Structure

```
smile-oracle-core/
├── app/
│   ├── api/
│   │   └── analyze-smile/        # AI Oracle scoring endpoint
│   ├── components/
│   │   ├── App.tsx               # Primary interface & state machine
│   │   ├── GoFundSmiles.tsx      # USDC treasury funding module
│   │   ├── ImageGrid.tsx         # Attestation gallery & Polaroid exporter
│   │   └── ui/                   # Neubrutalist Radix UI components
│   ├── constants/                # Nouns glasses SVG vector data
│   ├── utils/
│   │   └── camera.ts             # Biometric stream ingestion & storage layer
│   ├── globals.css               # Neubrutalist styling tokens
│   ├── layout.tsx                # Metadata & root layout
│   └── page.tsx                  # Application entrypoint
├── contracts/
│   └── smilePlease.sol           # Solidity smart contract (Base)
├── lib/
│   ├── auth.tsx                  # Web3 provider & Privy abstraction
│   └── utils.ts                  # Classname utilities
├── public/                       # Static brand assets and icon masks
└── tailwind.config.js            # Tailwind CSS configuration
```

---

## 🛡️ Security Considerations

- **Oracle Trust Assumption**: Contract execution depends on the integrity of the designated `aiOracle` address.
- **Sybil Resistance**: On-chain rate limiting and wallet-level identity verification mitigate duplicate reward claims.
- **Reentrancy Protection**: State updates (`smileScores`, `delete photoRequests`) occur prior to token transfers following the checks-effects-interactions pattern.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).