# ASI Wallet SDK

A TypeScript-based wallet SDK for the ASI Chain ecosystem, providing secure key management, RChain client integration, and wallet functionality for blockchain applications.

## Overview

The ASI Wallet SDK is a lightweight, modular library designed to simplify wallet integration and key management for ASI Chain applications. It includes built-in support for local key management and extensible wallet components.

## Project Structure

High-level layout of the repository:

```
asi-chain-wallet-sdk/
├── src/                # SDK source code (domains, services, utils)
├── playground/         # React playground for UI components and demos
│   ├── src/            # Playground React source
│   └── package.json
├── dist/               # Compiled output (generated)
├── package.json        # Root scripts and dependencies
└── README.md           # This file
```

## Documentation

The repository includes generated reference docs for the main code areas. See:

- Domains: [docs/DOMAINS.md](docs/DOMAINS.md)
- Services: [docs/SERVICES.md](docs/SERVICES.md)
- Utils: [docs/UTILS.md](docs/UTILS.md)
- Utils: [docs/PLAYGROUND.md](docs/PLAYGROUND.md)

Use those documents for quick API lookups and examples.

Key folders inside `src`:

- `domains/` — domain models (Wallet, Vault, Asset, etc.)
- `services/` — business services (Key Derivation, RChainService, WalletsService)
- `utils/` — codec, constants, polyfills, validators

## Components and Modules

- Client: core client component for wallet operations
- Key Manager: abstract interface for key management
- Local Key Manager: reference implementation of local key storage
- RPC Client: utilities for interacting with ASI Chain RPC endpoints


## Installation

```bash
npm install asi-wallet-sdk
```

## Quick Start

```typescript
import { /* components */ } from 'asi-wallet-sdk';

// Your wallet integration code here
```

## Development

### Setup

Install dependencies for SDK:

```bash
npm install
```

### Development Mode

Watch mode for SDK changes:

```bash
npm run dev
```

### Build

Build the SDK:

```bash
npm run build
```
### Playground

Install dependencies for Playground:
```
cd playground
```
```
npm install
```

Start the development playground (React + Vite):

```bash
npm run dev
```

## License

MIT
