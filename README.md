<div align="center">

# ASI Chain: Wallet SDK

[![Status](https://img.shields.io/badge/Status-BETA-FFA500?style=for-the-badge)](https://github.com/asi-alliance/asi-chain-wallet-sdk)
[![Version](https://img.shields.io/badge/Version-0.1.0-A8E6A3?style=for-the-badge)](https://github.com/asi-alliance/asi-chain-wallet-sdk/releases)
[![License](https://img.shields.io/badge/License-MIT-1A1A1A?style=for-the-badge)](LICENSE)
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

ASI Chain Wallet SDK is a lightweight, modular TypeScript library designed to simplify wallet integration and key management for [ASI Chain](https://github.com/asi-alliance/asi-chain) applications. It provides secure cryptographic operations, BIP-39/BIP-44 key derivation, encrypted storage mechanisms, and direct interaction with ASI Chain nodes.

The SDK supports both browser and Node.js environments with built-in [polyfills](src/utils/polyfills), making it suitable for web wallets, mobile applications, and backend services.

---

## Key Features

- **Wallet Management** - Create, import, and derive wallets from private keys or mnemonic phrases via [WalletsService](docs/SERVICES.md#walletsservice-srcserviceswalletserviceindexts)
- **Secure Storage** - Password-based encryption using PBKDF2 + AES via [CryptoService](docs/SERVICES.md#cryptoservice-srcservicescryptoindexts)
- **Key Derivation** - BIP-39 mnemonic generation and BIP-44 hierarchical deterministic key derivation via [KeyDerivationService](docs/SERVICES.md#keyderivationservice-srcserviceskeyderivationindexts)
- **Vault System** - Encrypted container for managing multiple wallets and seeds via [Vault](docs/DOMAINS.md#vault-srcdomainsvaultindexts)
- **Chain Interaction** - Direct communication with ASI Chain nodes via [RChainService](docs/SERVICES.md#rchainservice-srcserviceschainserviceindexts)
- **Address Generation** - secp256k1 key generation with keccak256/blake2b address derivation via [KeysService](docs/SERVICES.md#keysservice-srcserviceskeysserviceindexts)

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

See [WalletsService](docs/SERVICES.md#walletsservice-srcserviceswalletserviceindexts) and [MnemonicService](docs/SERVICES.md#mnemonicservice-srcservicesmnemonicindexts) for full API reference.

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

See [Vault](docs/DOMAINS.md#vault-srcdomainsvaultindexts) and [Wallet](docs/DOMAINS.md#wallet-srcdomainswalletindexts) for full API reference.

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

See [RChainService](docs/SERVICES.md#rchainservice-srcserviceschainserviceindexts) for full API reference. For amount conversions, see [functions utilities](docs/UTILS.md#functions-srcutilsfunctionsindexts).

---

## Architecture

### SDK Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        Application                               │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ASI Wallet SDK                               │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   Services (docs/SERVICES.md)                ││
│  │  • WalletsService      - Wallet creation & address derivation││
│  │  • CryptoService       - Password-based encryption (AES)     ││
│  │  • KeysService         - secp256k1 key generation            ││
│  │  • KeyDerivationService - BIP-32/BIP-44 derivation           ││
│  │  • MnemonicService     - BIP-39 mnemonic handling            ││
│  │  • RChainService       - Blockchain node interaction         ││
│  │  • FeeService          - Gas fee calculations                ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   Domains (docs/DOMAINS.md)                  ││
│  │  • Wallet              - Encrypted wallet with lock/unlock   ││
│  │  • Vault               - Multi-wallet container              ││
│  │  • Asset               - Token representation                ││
│  │  • SeedRecord          - Encrypted seed phrase storage       ││
│  │  • SecureStorage       - localStorage encryption layer       ││
│  │  • BinaryWriter        - Protobuf-like serialization         ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Utils (docs/UTILS.md)                     ││
│  │  • codec      - Base16/Base58 encoding                       ││
│  │  • constants  - Chain prefix, decimals, gas fees             ││
│  │  • validators - Address and account name validation          ││
│  │  • functions  - Atomic amount conversions                    ││
│  │  • polyfills  - Browser Buffer compatibility                 ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ASI Chain Network                             │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │  Validator   │  │  Validator   │  │  Observer    │           │
│  │    Nodes     │  │    Nodes     │  │    Node      │           │
│  │  (Deploys)   │  │  (Deploys)   │  │  (Queries)   │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

### Cryptographic Flow

- **Key Generation**: secp256k1 elliptic curve keypairs via [KeysService](docs/SERVICES.md#keysservice-srcserviceskeysserviceindexts)
- **Address Derivation**: keccak256 hash → blake2b checksum → Base58 encoding with [chain prefix](src/utils/constants)
- **Encryption**: PBKDF2 (200,000 iterations) → AES-256 via [CryptoService](docs/SERVICES.md#cryptoservice-srcservicescryptoindexts)
- **Mnemonic**: BIP-39 standard (12/24 words) via [MnemonicService](docs/SERVICES.md#mnemonicservice-srcservicesmnemonicindexts)
- **Derivation Path**: BIP-44 (`m/44'/60'/0'/0/index`) via [KeyDerivationService](docs/SERVICES.md#keyderivationservice-srcserviceskeyderivationindexts)

---

## Project Structure

```
asi-chain-wallet-sdk/
├── src/                        # SDK source code
│   ├── config/                # Configuration and constants
│   ├── domains/               # Domain models (→ docs/DOMAINS.md)
│   ├── services/              # Business logic (→ docs/SERVICES.md)
│   ├── utils/                 # Utilities (→ docs/UTILS.md)
│   └── index.ts              # Main export
│
├── playground/                # React demo app (→ docs/PLAYGROUND.md)
│   ├── src/
│   │   ├── components/       # UI components
│   │   ├── pages/            # WalletsPage demo
│   │   └── config/           # Network configuration
│   └── package.json
│
├── docs/                      # API reference
│   ├── DOMAINS.md            # Domain models
│   ├── SERVICES.md           # Services
│   ├── UTILS.md              # Utilities
│   └── PLAYGROUND.md         # Playground components
│
├── package.json              # SDK dependencies
├── tsconfig.build.json       # TypeScript config
└── README.md                 # This file
```

---

## Documentation

### SDK Reference

| Document | Description |
|----------|-------------|
| [docs/DOMAINS.md](docs/DOMAINS.md) | Domain models: [Wallet](docs/DOMAINS.md#wallet-srcdomainswalletindexts), [Vault](docs/DOMAINS.md#vault-srcdomainsvaultindexts), [Asset](docs/DOMAINS.md#asset-srcdomainsassetindexts), [SeedRecord](docs/DOMAINS.md#encryptedseedrecord-srcdomainsseedrecordindexts), [SecureStorage](docs/DOMAINS.md#securewebwalletsstorage-srcdomainssecurestorageindexts), [BinaryWriter](docs/DOMAINS.md#binarywriter-srcdomainsbinarywriterindexts) |
| [docs/SERVICES.md](docs/SERVICES.md) | Services: [WalletsService](docs/SERVICES.md#walletsservice-srcserviceswalletserviceindexts), [CryptoService](docs/SERVICES.md#cryptoservice-srcservicescryptoindexts), [KeysService](docs/SERVICES.md#keysservice-srcserviceskeysserviceindexts), [KeyDerivationService](docs/SERVICES.md#keyderivationservice-srcserviceskeyderivationindexts), [MnemonicService](docs/SERVICES.md#mnemonicservice-srcservicesmnemonicindexts), [RChainService](docs/SERVICES.md#rchainservice-srcserviceschainserviceindexts) |
| [docs/UTILS.md](docs/UTILS.md) | Utilities: [codec](docs/UTILS.md#codec-srcutilscodecindexts), [constants](docs/UTILS.md#constants-srcutilsconstantsindexts), [validators](docs/UTILS.md#validators-srcutilsvalidatorsindexts), [functions](docs/UTILS.md#functions-srcutilsfunctionsindexts), [polyfills](docs/UTILS.md#polyfills-srcutilspolyfillsindexts) |
| [docs/PLAYGROUND.md](docs/PLAYGROUND.md) | Playground components and usage examples |

### Related Resources

| Resource | Link |
|----------|------|
| ASI Chain Documentation | https://docs.asichain.io |
| ASI Chain Node | [github.com/asi-alliance/asi-chain](https://github.com/asi-alliance/asi-chain) |
| ASI Chain Wallet | [github.com/asi-alliance/asi-chain-wallet](https://github.com/asi-alliance/asi-chain-wallet) |
| ASI Chain Explorer | [github.com/asi-alliance/asi-chain-explorer](https://github.com/asi-alliance/asi-chain-explorer) |
| ASI Chain Faucet | [github.com/asi-alliance/asi-chain-faucet](https://github.com/asi-alliance/asi-chain-faucet) |

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

The [playground](playground) provides a React-based demo application for testing SDK functionality:

```bash
cd playground
npm install

# Create .env file with network configuration
# VITE_NETWORKS='[{"name":"DevNet","validatorURL":"...","readOnlyURL":"..."}]'

npm run dev
```

Playground available at `http://localhost:5173`. See [docs/PLAYGROUND.md](docs/PLAYGROUND.md) for component details.

### Dependencies

**SDK** ([package.json](package.json)):

| Package | Version | Purpose |
|---------|---------|---------|
| [axios](https://github.com/axios/axios) | 1.13.2 | HTTP client for node communication |
| [bip32](https://github.com/bitcoinjs/bip32) | 4.0.0 | BIP-32 hierarchical deterministic wallets |
| [bip39](https://github.com/bitcoinjs/bip39) | 3.1.0 | BIP-39 mnemonic generation |
| [blakejs](https://github.com/dcposch/blakejs) | 1.2.1 | BLAKE2b hashing for addresses |
| [bs58](https://github.com/cryptocoinjs/bs58) | 6.0.0 | Base58 encoding |
| [crypto-js](https://github.com/brix/crypto-js) | 4.2.0 | AES encryption and PBKDF2 |
| [elliptic](https://github.com/indutny/elliptic) | 6.6.1 | secp256k1 elliptic curve operations |
| [js-sha3](https://github.com/nicknisi/js-sha3) | 0.9.3 | keccak256 hashing |
| [tiny-secp256k1](https://github.com/nicknisi/tiny-secp256k1) | 2.2.4 | secp256k1 for BIP-32 derivation |

**Playground** ([playground/package.json](playground/package.json)):

| Package | Version | Purpose |
|---------|---------|---------|
| [react](https://react.dev) | 18.2.0 | UI framework |
| [vite](https://vite.dev) | 7.2.6 | Build tool and dev server |

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) file for details.

---

ASI Alliance founding members: Fetch.ai, SingularityNET, and CUDOS
