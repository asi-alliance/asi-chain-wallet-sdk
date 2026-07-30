<div align="center">

# ASI Chain: Wallet SDK

[![Status](https://img.shields.io/badge/Status-BETA-FFA500?style=for-the-badge)](https://github.com/asi-alliance/asi-chain-wallet-sdk)
[![License](https://img.shields.io/badge/License-Apache_2.0-green?style=for-the-badge)](LICENSE)
[![Docs](https://img.shields.io/badge/Docs-Available-C4F0C1?style=for-the-badge)](https://docs.asichain.io)
</br>
![npm](https://img.shields.io/npm/v/@asichain/asi-wallet-sdk?label=asi-wallet-sdk&color=blue)

<h3>TypeScript SDK for wallet management and blockchain interaction on ASI Chain</h3>

Part of the [**Artificial Superintelligence Alliance**](https://superintelligence.io) ecosystem

_Uniting Fetch.ai, SingularityNET, and CUDOS_

</div>

---

## Table of Contents

1. [Overview](#overview)
2. [Key Features](#key-features)
3. [Installation](#installation)
4. [Quick Start](#quick-start)
5. [Architecture](#architecture)
6. [Project Structure](#project-structure)
7. [Documentation](#documentation)
8. [Security](#security)
9. [Development](#development)
10. [License](#license)

---

## Overview

ASI Chain Wallet SDK is a modular TypeScript library designed to simplify wallet integration and key management for [ASI Chain](https://github.com/asi-alliance/asi-chain) applications. It is organized around a high-level [`Client`](docs/DOMAINS.md) facade that manages multi-account HD wallets, secure encrypted storage, multi-network access, and reservation-aware transfers, while keeping secret material behind a strict signing boundary.

---

## Key Features

- **Client Facade** - Single entry point for wallet lifecycle, networks, balances, and transfers via [Client](docs/DOMAINS.md)
- **Multi-Account HD Wallets** - Private-key and BIP-39/BIP-44 HD wallets with on-demand account derivation via [Wallet](docs/DOMAINS.md) and [Account](docs/DOMAINS.md)
- **Secure Key Handling** - PBKDF2 + AES-GCM encryption with key zeroization and a no-raw-export signing boundary via [CryptoService](docs/SERVICES.md) and [Signer](docs/DOMAINS.md)
- **Cross-Environment Storage** - IndexedDB (browser) and node-persist (Node.js) behind a shared table abstraction via [storage layer](docs/DOMAINS.md)
- **Pending-Transaction Reservations** - Persistent, reservation-aware available balance with deploy-status polling via [ReservationAdapter](docs/DOMAINS.md)
- **Multi-Network Access** - Runtime network switching over validator, read-only, and GraphQL indexer clients via [ApiClientManager](docs/DOMAINS.md)
- **Per-Network Node Profiles** - Legacy Scala and new Rust f1r3node request contracts behind one interface via [NodeApiAdapter](docs/DOMAINS.md)
- **Transaction History** - Indexed transfer history through a GraphQL anti-corruption layer via [AccountDataService](docs/SERVICES.md)

---

## Installation

```bash
npm install @asichain/asi-wallet-sdk
```

---

## Quick Start

### Create the Client

The [`Client`](docs/DOMAINS.md) is the single entry point. Provide a per-network
configuration and (optionally) a default network.

```typescript
import {
    Client,
    NodeApiProfile,
    type TNetworksConfig,
} from "@asichain/asi-wallet-sdk";

const networksConfig: TNetworksConfig = {
    DevNet: {
        ValidatorURL: "http://validator-node:40403",
        ReadOnlyURL: "http://observer-node:40403",
        IndexerURL: "http://indexer-node:8080",
        nodeApiProfile: NodeApiProfile.SCALA,
    },
    Dev: {
        ValidatorURL: "",
        ReadOnlyURL: "",
        IndexerURL: "",
        nodeApiProfile: NodeApiProfile.RUST,
    },
    MainNet: {
        ValidatorURL: "",
        ReadOnlyURL: "",
        IndexerURL: "",
        nodeApiProfile: NodeApiProfile.SCALA,
    },
    TestNet: {
        ValidatorURL: "",
        ReadOnlyURL: "",
        IndexerURL: "",
        nodeApiProfile: NodeApiProfile.SCALA,
    },
};

const client = await Client.create({
    networksConfig,
    defaultNetwork: "DevNet",
});
```

`nodeApiProfile` is required on every network. It selects which f1r3node
implementation the SDK talks to — `SCALA` for the legacy node, `RUST` for the new
one — and that choice drives the HTTP request shape, the endpoint a given call
targets, and which Rholang vault contract the built-in terms address. There is no
default: an omitted or unknown profile throws at `Client.create`, because guessing
it would silently send legacy-shaped requests to a new node. Custom networks added
at runtime through `client.addNetwork` must supply it too.

### Create Wallets

```typescript
import { MnemonicStrength } from "@asichain/asi-wallet-sdk";

// HD (mnemonic) wallet
const mnemonic = client.generateMnemonic(MnemonicStrength.TWELVE_WORDS);
const hdWallet = await client.createHDWallet(
    { mnemonic, accountName: "Account 1" },
    "wallet-password",
);

// Private-key wallet
const privateKey = client.generatePrivateKey();
const pkWallet = await client.createPrivateKeyWallet(
    { privateKey, accountName: "Imported" },
    "wallet-password",
);

// Derive another account on the HD wallet
const { account } = await client.deriveAccount(
    hdWallet.getId(),
    "Account 2",
    "wallet-password",
);
console.log("New address:", account.getAddress());
```

See [Client](docs/DOMAINS.md), [Wallet](docs/DOMAINS.md), and [Account](docs/DOMAINS.md) for the full API reference.

### Check Balance and Transfer

```typescript
const active = hdWallet.getActiveAccount()!;

// Total and reservation-aware available balance
const balance = await client.getBalance(active.getAddress());
const available = await client.getAvailableBalance(
    hdWallet.getId(),
    active.getId(),
);
console.log("Balance:", client.toDisplayAmount(balance));

// Transfer tokens (amount in atomic units)
const deployId = await client.transfer(
    {
        walletId: hdWallet.getId(),
        accountId: active.getId(),
        to: recipientAddress,
        amount: client.toAtomicAmount("10"), // 10 ASI
    },
    "wallet-password",
);
console.log("Deploy id:", deployId);
```

See [Client](docs/DOMAINS.md) for the full API reference. For amount conversions, see [functions utilities](docs/UTILS.md).

---

## Architecture

### SDK Components

```
┌──────────────────────────────────────────────────────────────────┐
│                        Application                               │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     ASI Wallet SDK                                  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Client (facade)                            │  │
│  │  Wallet & account lifecycle • networks • balances • transfers │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                      Domains                                  │  │
│  │  • Wallet / Account    - Multi-account HD & PK wallets        │  │
│  │  • Signer (HD / PK)    - No-raw-export signing boundary       │  │
│  │  • Asset               - Token representation                 │  │
│  │  • ReservationAdapter  - Pending-transaction reservations     │  │
│  │  • ApiClientManager    - Per-network transport clients        │  │
│  │  • ApiServiceRegistry  - Service composition root             │  │
│  │  • Storage repositories- Signers / Accounts / Reservations    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                  Services / Managers                          │  │
│  │  • WalletManager / AccountManager - In-memory ownership       │  │
│  │  • StorageManager      - Persistence orchestration            │  │
│  │  • DeployService / BlockService / AccountDataService          │  │
│  │  • AssetsService / TransactionService / DeployStatusPoller    │  │
│  │  • CryptoService / KeysManager / KeyDerivation / Mnemonic     │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Storage backends                           │  │
│  │  • BrowserStorage (IndexedDB) • NodeStorage (node-persist)    │  │
│  │    selected automatically by environment                      │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Utils / Config                             │  │
│  │  • codec / constants / validators / functions / polyfills     │  │
│  │  • decorators / guards / fabrics                              │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    ASI Chain Network                                │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │  Validator   │  │  Observer    │  │  Indexer     │               │
│  │    Node      │  │    Node      │  │  (GraphQL)   │               │
│  │  (Deploys)   │  │  (Queries)   │  │  (History)   │               │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
```

### Cryptographic Flow

- **Key Generation**: secp256k1 elliptic curve keypairs via [KeysManager](docs/SERVICES.md)
- **Address Derivation**: keccak256 hash → blake2b checksum → Base58 encoding with [chain prefix](src/utils/constants)
- **Encryption**: PBKDF2 (100,000 iterations) → AES-GCM via [CryptoService](docs/SERVICES.md)
- **Mnemonic**: BIP-39 standard (12/24 words) via [MnemonicService](docs/SERVICES.md)
- **Derivation Path**: BIP-44 via [KeyDerivationService](docs/SERVICES.md)

---

## Project Structure

```
asi-chain-wallet-sdk/
├── src/                        # SDK source code
│   ├── config/                # Runtime defaults and constants
│   ├── domains/               # Domain models & transport (→ docs/DOMAINS.md)
│   ├── services/              # Managers & business logic (→ docs/SERVICES.md)
│   ├── fabrics/               # Environment-aware factories (storage)
│   ├── utils/                 # Utilities & guards (→ docs/UTILS.md)
│   └── index.ts              # Main export
│
├── playground/                # React demo app (→ docs/PLAYGROUND.md)
│   ├── src/
│   │   ├── sdk-react-kit/    # SDK ↔ React integration layer (hooks, context)
│   │   ├── components/       # UI components
│   │   ├── pages/            # WalletsPage, TxHistoryPage
│   │   └── router/           # Client-side routing
│   └── package.json
│
├── docs/                      # API reference
│   ├── DOMAINS.md            # Domain models & transport
│   ├── SERVICES.md           # Managers & services
│   ├── UTILS.md              # Utilities & config
│   └── PLAYGROUND.md         # Playground components
│
├── package.json              # SDK dependencies
├── tsconfig.build.json       # TypeScript config
└── README.md                 # This file
```

---

## Documentation

### SDK Reference

| Document                                 | Description                                                                                                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [docs/DOMAINS.md](docs/DOMAINS.md)       | Domain models & transport (`Client`, `Wallet`, `Account`, `Signer`, `ReservationAdapter`, `ApiClientManager`, `NodeApiAdapter`, storage repositories, and types) |
| [docs/SERVICES.md](docs/SERVICES.md)     | Managers & services (`WalletManager`, `AccountManager`, `StorageManager`, `DeployService`, `AssetsService`, `TransactionService`, `CryptoService`) |
| [docs/UTILS.md](docs/UTILS.md)           | Utilities & config (`codec`, `constants`, `validators`, `functions`, `guards`, `decorators`, `fabrics`, `polyfills`)                               |
| [docs/PLAYGROUND.md](docs/PLAYGROUND.md) | Playground components, the `sdk-react-kit` integration layer, and usage examples                                                                   |

### Related Resources

| Resource                | Link                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| ASI Chain Documentation | https://docs.asichain.io                                                                         |
| ASI Chain Node          | [github.com/asi-alliance/asi-chain](https://github.com/asi-alliance/asi-chain)                   |
| ASI Chain Wallet        | [github.com/asi-alliance/asi-chain-wallet](https://github.com/asi-alliance/asi-chain-wallet)     |
| ASI Chain Explorer      | [github.com/asi-alliance/asi-chain-explorer](https://github.com/asi-alliance/asi-chain-explorer) |
| ASI Chain Faucet        | [github.com/asi-alliance/asi-chain-faucet](https://github.com/asi-alliance/asi-chain-faucet)     |

---

## Security

| Document                                         | Description                                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| [SECURITY.md](SECURITY.md)                       | Vulnerability reporting policy, disclosure process, and supported versions |
| [THREAT_MODEL.md](THREAT_MODEL.md)               | Threat assumptions, trust boundaries, adversary model, and mitigations     |
| [SECURITY_INVARIANTS.md](SECURITY_INVARIANTS.md) | Non-negotiable key/storage/signing/documentation security guarantees       |
| [CRYPTO_PROFILE.md](CRYPTO_PROFILE.md)           | Versioned crypto parameters, key-handling profile, and migration notes     |

---

## Development

### Prerequisites

- Node.js 18.x or higher
- npm 9.x or higher

### Setup

```bash
# Install SDK dependencies
npm install

# Build the SDK
npm run build

# Watch mode for development
npm run dev

# Run security release gates locally
npm run security:gate
```

### Playground

The [playground](playground) provides a React-based demo application for testing SDK functionality:

```bash
cd playground
npm install

# Create .env file with per-network endpoints, e.g.:
# VITE_DEFAULT_NETWORK=DevNet
# VITE_DEVNET_VALIDATOR_URL=...
# VITE_DEVNET_READONLY_URL=...
# VITE_DEVNET_INDEXER_URL=...

npm run dev
```

Playground available at `http://localhost:5173`. See [docs/PLAYGROUND.md](docs/PLAYGROUND.md) for component details.

### Dependencies

**SDK** ([package.json](package.json)):

| Package                                                          | Version | Purpose                                   |
| ---------------------------------------------------------------- | ------- | ----------------------------------------- |
| [axios](https://github.com/axios/axios)                          | 1.13.2  | HTTP client for node communication        |
| [bip32](https://github.com/bitcoinjs/bip32)                      | 4.0.0   | BIP-32 hierarchical deterministic wallets |
| [bip39](https://github.com/bitcoinjs/bip39)                      | 3.1.0   | BIP-39 mnemonic generation                |
| [blakejs](https://github.com/dcposch/blakejs)                    | 1.2.1   | BLAKE2b hashing for addresses             |
| [bs58](https://github.com/cryptocoinjs/bs58)                     | 6.0.0   | Base58 encoding                           |
| [@noble/hashes](https://github.com/paulmillr/noble-hashes)       | 1.6.0   | Cryptographic hash helpers                |
| [@noble/secp256k1](https://github.com/paulmillr/noble-secp256k1) | 1.7.0   | secp256k1 key generation and signing      |
| [js-sha3](https://github.com/nicknisi/js-sha3)                   | 0.9.3   | keccak256 hashing                         |
| [node-persist](https://github.com/simonlast/node-persist)        | 4.0.4   | Node.js storage backend                   |
| [buffer](https://github.com/feross/buffer)                       | 6.0.3   | Browser Buffer compatibility              |

**Playground** ([playground/package.json](playground/package.json)):

| Package                    | Version | Purpose                   |
| -------------------------- | ------- | ------------------------- |
| [react](https://react.dev) | 18.2.0  | UI framework              |
| [vite](https://vite.dev)   | 7.2.6   | Build tool and dev server |

---

## License

This project is licensed under the Apache 2.0 License. See [LICENSE](LICENSE) file for details.

---

ASI Alliance founding members: Fetch.ai, SingularityNET, and CUDOS
