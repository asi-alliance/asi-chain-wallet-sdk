<div align="center">

# ASI Chain: Wallet SDK

[![Status](https://img.shields.io/badge/Status-BETA-FFA500?style=for-the-badge)](https://github.com/asi-alliance/asi-chain-wallet-sdk)
[![Version](https://img.shields.io/badge/Version-0.1.0-A8E6A3?style=for-the-badge)](https://github.com/asi-alliance/asi-chain-wallet-sdk/releases)
[![License](https://img.shields.io/badge/License-Apache%202.0-1A1A1A?style=for-the-badge)](LICENSE)
[![Docs](https://img.shields.io/badge/Docs-Available-C4F0C1?style=for-the-badge)](https://docs.asichain.io)

<h3>TypeScript SDK for wallet management and blockchain interaction on ASI Chain</h3>

Part of the [**Artificial Superintelligence Alliance**](https://superintelligence.io) ecosystem

*Uniting Fetch.ai, SingularityNET, and CUDOS*

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
8. [Development](#development)
9. [License](#license)

---

## Overview

ASI Chain Wallet SDK is a lightweight, modular TypeScript library designed to simplify wallet integration and key management for ASI Chain applications. It provides secure cryptographic operations, BIP-39/BIP-44 key derivation, encrypted storage mechanisms, and direct interaction with ASI Chain nodes.

The SDK supports both browser and Node.js environments with built-in polyfills, making it suitable for web wallets, mobile applications, and backend services.

---

## Key Features

- **Wallet Management** - Create, import, and derive wallets from private keys or mnemonic phrases
- **Secure Storage** - Password-based encryption using PBKDF2 + AES for private keys and seed phrases
- **Key Derivation** - BIP-39 mnemonic generation and BIP-44 hierarchical deterministic key derivation
- **Vault System** - Encrypted container for managing multiple wallets and seeds with localStorage persistence
- **Chain Interaction** - Direct communication with ASI Chain nodes for balance queries and token transfers
- **Address Generation** - secp256k1 key generation with keccak256/blake2b address derivation

---

## Installation

```bash
npm install asi-wallet-sdk
```

---

## Quick Start

### Create a New Wallet

```typescript
import { WalletsService, MnemonicService } from 'asi-wallet-sdk';

// Generate a new wallet with random keys
const wallet = WalletsService.createWallet();
console.log('Address:', wallet.address);
console.log('Public Key:', wallet.publicKey);

// Create wallet from mnemonic
const mnemonic = MnemonicService.generateMnemonic();
const derivedWallet = await WalletsService.createWalletFromMnemonic(mnemonic, 0);
console.log('Derived Address:', derivedWallet.address);
```

### Manage Wallets with Vault

```typescript
import { Vault, Wallet } from 'asi-wallet-sdk';

// Create and unlock vault
const vault = new Vault();
vault.lock('vault-password');

// Add wallet to vault
const wallet = Wallet.fromPrivateKey('My Wallet', privateKey, 'wallet-password');
vault.unlock('vault-password');
vault.addWallet(wallet);

// Save vault to localStorage
vault.lock('vault-password');
vault.save();
```

### Check Balance and Transfer

```typescript
import { RChainService } from 'asi-wallet-sdk';

const chainService = new RChainService({
  validatorURL: 'http://validator-node:40403',
  readOnlyURL: 'http://observer-node:40403'
});

// Get ASI balance
const balance = await chainService.getASIBalance(address);
console.log('Balance:', balance.toString());

// Transfer tokens
const deployId = await chainService.transfer(
  fromAddress,
  toAddress,
  BigInt(1000000000), // 10 ASI in atomic units
  privateKey
);
```

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
│  │                      Services                                 │  │
│  │  • WalletsService       - Wallet creation & address derivation│  │
│  │  • CryptoService        - Password-based encryption (AES)     │  │
│  │  • KeysService          - secp256k1 key generation            │  │
│  │  • KeyDerivationService - BIP-32/BIP-44 derivation            │  │
│  │  • MnemonicService      - BIP-39 mnemonic handling            │  │
│  │  • RChainService        - Blockchain node interaction         │  │
│  │  • FeeService           - Gas fee calculations                │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                      Domains                                  │  │
│  │  • Wallet              - Encrypted wallet with lock/unlock    │  │
│  │  • Vault               - Multi-wallet container               │  │
│  │  • Asset               - Token representation                 │  │
│  │  • SeedRecord          - Encrypted seed phrase storage        │  │
│  │  • SecureStorage       - localStorage encryption layer        │  │
│  │  • BinaryWriter        - Protobuf-like serialization          │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                       Utils                                   │  │
│  │  • codec      - Base16/Base58 encoding                        │  │
│  │  • constants  - Chain prefix, decimals, gas fees              │  │
│  │  • validators - Address and account name validation           │  │
│  │  • functions  - Atomic amount conversions                     │  │
│  │  • polyfills  - Browser Buffer compatibility                  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    ASI Chain Network                                │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │  Validator   │  │  Validator   │  │  Observer    │               │
│  │    Nodes     │  │    Nodes     │  │    Node      │               │
│  │  (Deploys)   │  │  (Deploys)   │  │  (Queries)   │               │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
```

### Cryptographic Flow

- **Key Generation**: secp256k1 elliptic curve keypairs
- **Address Derivation**: keccak256 hash → blake2b checksum → Base58 encoding with chain prefix
- **Encryption**: PBKDF2 (200,000 iterations) → AES-256 with random salt and IV
- **Mnemonic**: BIP-39 standard with 12 or 24 word phrases
- **Derivation Path**: BIP-44 (`m/44'/60'/0'/0/index`)

---

## Project Structure

```
asi-chain-wallet-sdk/
├── src/                        # SDK source code
│   ├── config/                # Configuration and constants
│   │   └── index.ts          # Client config, timeouts, limits
│   │
│   ├── domains/               # Domain models
│   │   ├── Asset/            # Token representation
│   │   ├── BinaryWriter/     # Protobuf-like serialization
│   │   ├── SecureStorage/    # localStorage encryption
│   │   ├── SeedRecord/       # Encrypted seed phrase
│   │   ├── Vault/            # Multi-wallet container
│   │   └── Wallet/           # Wallet with lock/unlock
│   │
│   ├── services/              # Business logic services
│   │   ├── Chain/            # RChain node interaction
│   │   ├── Crypto/           # Password-based encryption
│   │   ├── Fee/              # Gas fee calculations
│   │   ├── KeyDerivation/    # BIP-32/BIP-44 derivation
│   │   ├── KeysService/      # secp256k1 key generation
│   │   ├── Mnemonic/         # BIP-39 mnemonic handling
│   │   └── Wallets/          # Wallet creation & address derivation
│   │
│   ├── utils/                 # Utility functions
│   │   ├── codec/            # Base16/Base58 encoding
│   │   ├── constants/        # Chain prefix, decimals, gas fees
│   │   ├── functions/        # Atomic amount conversions
│   │   ├── polyfills/        # Browser Buffer compatibility
│   │   └── validators/       # Address and name validation
│   │
│   └── index.ts              # Main export
│
├── playground/                # React demo application
│   ├── src/
│   │   ├── components/       # UI components (modals, cards, forms)
│   │   ├── pages/            # WalletsPage demo
│   │   ├── hooks/            # useLoader hook
│   │   └── config/           # Network configuration
│   ├── package.json          # Playground dependencies
│   └── vite.config.ts        # Vite build configuration
│
├── docs/                      # API reference documentation
│   ├── DOMAINS.md            # Domain models reference
│   ├── SERVICES.md           # Services reference
│   ├── UTILS.md              # Utilities reference
│   └── PLAYGROUND.md         # Playground components reference
│
├── package.json              # SDK dependencies
├── tsconfig.build.json       # TypeScript build configuration
└── README.md                 # This file
```

---

## Documentation

### SDK Reference

- **[docs/DOMAINS.md](docs/DOMAINS.md)** - Domain models (Wallet, Vault, Asset, SeedRecord, SecureStorage, BinaryWriter)
- **[docs/SERVICES.md](docs/SERVICES.md)** - Services (WalletsService, CryptoService, KeysService, KeyDerivationService, MnemonicService, RChainService, FeeService)
- **[docs/UTILS.md](docs/UTILS.md)** - Utilities (codec, constants, validators, functions, polyfills)
- **[docs/PLAYGROUND.md](docs/PLAYGROUND.md)** - Playground components and usage

### Related Resources

- **ASI Chain Documentation**: https://docs.asichain.io
- **ASI Chain Repository**: https://github.com/asi-alliance/asi-chain
- **ASI Chain Wallet**: https://github.com/asi-alliance/asi-chain-wallet
- **ASI Chain Explorer**: https://github.com/asi-alliance/asi-chain-explorer

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
```

### Playground

The playground provides a React-based demo application for testing SDK functionality:

```bash
# Navigate to playground
cd playground

# Install dependencies
npm install

# Create .env file with network configuration
# VITE_NETWORKS='[{"name":"DevNet","validatorURL":"...","readOnlyURL":"..."}]'

# Start development server
npm run dev
```

Playground available at `http://localhost:5173`.

### Technology Stack

**SDK Dependencies:**

| Package | Version | Purpose |
|---------|---------|---------|
| axios | 1.13.2 | HTTP client for node communication |
| bip32 | 4.0.0 | BIP-32 hierarchical deterministic wallets |
| bip39 | 3.1.0 | BIP-39 mnemonic generation |
| blakejs | 1.2.1 | BLAKE2b hashing for addresses |
| bs58 | 6.0.0 | Base58 encoding |
| crypto-js | 4.2.0 | AES encryption and PBKDF2 |
| elliptic | 6.6.1 | secp256k1 elliptic curve operations |
| js-sha3 | 0.9.3 | keccak256 hashing |
| tiny-secp256k1 | 2.2.4 | secp256k1 for BIP-32 derivation |

**Playground Dependencies:**

| Package | Version | Purpose |
|---------|---------|---------|
| react | 18.2.0 | UI framework |
| vite | 7.2.6 | Build tool and dev server |
| vite-plugin-node-polyfills | 0.24.0 | Node.js polyfills for browser |

---

## License

Copyright 2025 Artificial Superintelligence Alliance

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at:

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

---

ASI Alliance founding members: Fetch.ai, SingularityNET, and CUDOS
